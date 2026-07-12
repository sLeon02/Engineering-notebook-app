'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const PHOTO_BUCKET = 'notebook-photos';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Home() {
  const [project, setProject] = useState('');
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ msg: '', error: false });
  const [generating, setGenerating] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const active = entries.find((e) => e.id === activeId) || null;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data: entryRows, error } = await supabase
      .from('entries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setStatus({ msg: 'Could not load entries: ' + error.message, error: true });
      setLoading(false);
      return;
    }

    const { data: photoRows } = await supabase.from('photos').select('*');

    const withPhotos = (entryRows || []).map((e) => ({
      ...e,
      photos: (photoRows || []).filter((p) => p.entry_id === e.id),
    }));

    setEntries(withPhotos);
    if (withPhotos.length && !activeId) setActiveId(withPhotos[0].id);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadEntries();
    if (typeof window !== 'undefined') {
      const saved = window.localStorage?.getItem?.('notebook-project-name');
      // localStorage is fine here since this is a real deployed site, not a claude.ai artifact
      if (saved) setProject(saved);
    }
  }, [loadEntries]);

  async function createEntry() {
    const { data, error } = await supabase
      .from('entries')
      .insert({
        project,
        title: '',
        entry_date: todayISO(),
        author: '',
        notes: '',
        generated: '',
        ai_generated: false,
      })
      .select()
      .single();

    if (error) {
      setStatus({ msg: 'Could not create entry: ' + error.message, error: true });
      return;
    }
    setEntries((prev) => [{ ...data, photos: [] }, ...prev]);
    setActiveId(data.id);
    setStatus({ msg: '', error: false });
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    const { error } = await supabase.from('entries').delete().eq('id', id);
    if (error) {
      setStatus({ msg: 'Could not delete entry: ' + error.message, error: true });
      return;
    }
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || null);
      return next;
    });
  }

  function updateLocal(id, patch) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function persistField(id, field, value) {
    const { error } = await supabase.from('entries').update({ [field]: value }).eq('id', id);
    if (error) setStatus({ msg: 'Could not save: ' + error.message, error: true });
  }

  async function saveEntry(entry) {
    const { error } = await supabase
      .from('entries')
      .update({
        title: entry.title,
        entry_date: entry.entry_date,
        author: entry.author,
        notes: entry.notes,
        generated: entry.generated,
      })
      .eq('id', entry.id);
    setStatus(
      error
        ? { msg: 'Could not save: ' + error.message, error: true }
        : { msg: 'Entry saved.', error: false }
    );
  }

  async function uploadPhotos(entry, files) {
    for (const file of Array.from(files)) {
      const path = `${entry.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setStatus({ msg: 'Photo upload failed: ' + uploadError.message, error: true });
        continue;
      }

      const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);

      const { data: photoRow, error: insertError } = await supabase
        .from('photos')
        .insert({
          entry_id: entry.id,
          storage_path: path,
          url: publicUrlData.publicUrl,
          caption: '',
        })
        .select()
        .single();

      if (insertError) {
        setStatus({ msg: 'Could not save photo: ' + insertError.message, error: true });
        continue;
      }

      updateLocal(entry.id, { photos: [...entry.photos, photoRow] });
    }
  }

  async function removePhoto(entry, photo) {
    await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
    await supabase.from('photos').delete().eq('id', photo.id);
    updateLocal(entry.id, { photos: entry.photos.filter((p) => p.id !== photo.id) });
  }

  async function updatePhotoCaption(entry, photo, caption) {
    updateLocal(entry.id, {
      photos: entry.photos.map((p) => (p.id === photo.id ? { ...p, caption } : p)),
    });
    await supabase.from('photos').update({ caption }).eq('id', photo.id);
  }

  async function generateEntry(entry) {
    if (!entry.notes?.trim() && entry.photos.length === 0) {
      setStatus({ msg: 'Add some notes or at least one photo first.', error: true });
      return;
    }
    setGenerating(true);
    setStatus({ msg: 'Sending notes and photos to the assistant...', error: false });

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          title: entry.title,
          date: entry.entry_date,
          author: entry.author,
          notes: entry.notes,
          photos: entry.photos.map((p) => ({ url: p.url, caption: p.caption })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed.');
      }

      updateLocal(entry.id, { generated: data.text, ai_generated: true });
      await supabase
        .from('entries')
        .update({ generated: data.text, ai_generated: true })
        .eq('id', entry.id);

      setStatus(
        data.warning
          ? { msg: data.warning, error: true }
          : { msg: 'Draft ready — review and edit below before saving.', error: false }
      );
    } catch (err) {
      setStatus({ msg: err.message || 'Something went wrong. Please try again.', error: true });
    } finally {
      setGenerating(false);
    }
  }

  async function exportPdf() {
    if (entries.length === 0) {
      setStatus({ msg: 'Add at least one entry before exporting.', error: true });
      return;
    }
    setExportingPdf(true);
    setStatus({ msg: 'Building your notebook PDF...', error: false });
    try {
      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, entries }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not generate the PDF.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project || 'engineering-notebook').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setStatus({ msg: 'Notebook PDF downloaded.', error: false });
    } catch (err) {
      setStatus({ msg: err.message || 'Could not generate the PDF.', error: true });
    } finally {
      setExportingPdf(false);
    }
  }

  function saveProjectName(name) {
    setProject(name);
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem?.('notebook-project-name', name);
    }
  }

  const pageNumber = active ? entries.length - entries.findIndex((e) => e.id === activeId) : 0;

  return (
    <div className="app">
      <div className="sidebar">
        <div className="punch-holes">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <div className="brand">
          <span className="eyebrow">Design &amp; Build Log</span>
          <h1>Engineering<br />Notebook</h1>
          <p>Turn field notes and progress photos into dated, judge-ready notebook entries.</p>
        </div>
        <div className="project-field">
          <label htmlFor="projectName">Project / Team name</label>
          <input
            id="projectName"
            type="text"
            placeholder="e.g. FRC Team 4915 — Swerve Drive"
            value={project}
            onChange={(e) => saveProjectName(e.target.value)}
          />
        </div>
        <div className="entry-list">
          {entries.map((e, idx) => (
            <div
              key={e.id}
              className={'entry-tab' + (e.id === activeId ? ' active' : '')}
              onClick={() => setActiveId(e.id)}
            >
              <span className="tab-num">{String(entries.length - idx).padStart(2, '0')}</span>
              <span className="tab-title">{e.title || 'Untitled entry'}</span>
              <span className="tab-date">{formatDateShort(e.entry_date)}</span>
            </div>
          ))}
        </div>
        <button className="new-entry-btn" onClick={createEntry} disabled={loading}>
          + New Entry
        </button>
        <div className="sidebar-footer">
          <button className="export-btn" onClick={exportPdf} disabled={exportingPdf}>
            {exportingPdf ? 'Building PDF...' : 'Download Notebook PDF'}
          </button>
        </div>
      </div>

      <div className="main">
        {!active ? (
          <div className="empty-state">
            <h2>{loading ? 'Loading notebook…' : 'No entries yet'}</h2>
            {!loading && (
              <p>
                Every good engineering notebook starts with a first page. Click{' '}
                <strong>+ New Entry</strong> to log today&apos;s work — add your notes and
                progress photos, and let the assistant help you write it up in proper notebook
                form.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="page-header">
              <div className="meta">{project || 'Untitled project'}</div>
              <div className="page-num-stamp">PAGE {String(pageNumber).padStart(3, '0')}</div>
            </div>

            <div className="sheet">
              <div className="field-row">
                <label>Entry title</label>
                <input
                  className="title-input"
                  type="text"
                  placeholder="What did you work on today?"
                  value={active.title}
                  onChange={(e) => updateLocal(active.id, { title: e.target.value })}
                  onBlur={(e) => persistField(active.id, 'title', e.target.value)}
                />
              </div>

              <div className="two-col">
                <div className="field-row">
                  <label>Date</label>
                  <input
                    type="date"
                    value={active.entry_date || todayISO()}
                    onChange={(e) => {
                      updateLocal(active.id, { entry_date: e.target.value });
                      persistField(active.id, 'entry_date', e.target.value);
                    }}
                  />
                </div>
                <div className="field-row">
                  <label>Logged by</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={active.author}
                    onChange={(e) => updateLocal(active.id, { author: e.target.value })}
                    onBlur={(e) => persistField(active.id, 'author', e.target.value)}
                  />
                </div>
              </div>

              <div className="field-row">
                <label>Raw notes — what happened, what you tried, what you observed</label>
                <textarea
                  className="notes-input"
                  placeholder="e.g. Tested the new gripper mechanism, it slipped on round objects..."
                  value={active.notes}
                  onChange={(e) => updateLocal(active.id, { notes: e.target.value })}
                  onBlur={(e) => persistField(active.id, 'notes', e.target.value)}
                />
              </div>

              <div className="field-row">
                <label>Photos</label>
                <div className="photo-zone">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files?.length) uploadPhotos(active, e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <div className="photo-grid">
                    {active.photos.map((p) => (
                      <div className="photo-card" key={p.id}>
                        <button className="remove-photo" onClick={() => removePhoto(active, p)}>
                          ×
                        </button>
                        <img src={p.url} alt={p.caption || 'entry photo'} />
                        <input
                          type="text"
                          placeholder="Caption..."
                          value={p.caption}
                          onChange={(e) => updatePhotoCaption(active, p, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="action-row">
                <button
                  className="btn-primary"
                  onClick={() => generateEntry(active)}
                  disabled={generating}
                >
                  {generating ? 'Drafting entry...' : '✎ Generate notebook entry'}
                </button>
                <button className="btn-secondary" onClick={() => saveEntry(active)}>
                  Save entry
                </button>
                <button className="btn-danger-text" onClick={() => deleteEntry(active.id)}>
                  Delete this entry
                </button>
              </div>
              <div className={'status-line' + (status.error ? ' error' : '')}>{status.msg}</div>

              {active.generated ? (
                <div className="result-wrap">
                  {active.ai_generated && (
                    <div className="stamp">
                      AI
                      <br />
                      DRAFT —
                      <br />
                      REVIEW &amp;
                      <br />
                      EDIT
                    </div>
                  )}
                  <div className="field-row" style={{ marginBottom: 6 }}>
                    <label>Notebook entry (edit freely — make it yours)</label>
                  </div>
                  <textarea
                    className="result-text"
                    value={active.generated}
                    onChange={(e) => updateLocal(active.id, { generated: e.target.value })}
                    onBlur={(e) => persistField(active.id, 'generated', e.target.value)}
                  />
                  <div className="result-hint">
                    This was drafted from your notes and photos. Read it over, fix anything
                    inaccurate, and add your own voice before it goes in the notebook.
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
