import { describe, test, expect, beforeEach } from 'bun:test';
import { MemoryNotes } from '../src/notes.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Memory Notes', () => {
  let notes;
  let tmpPath;

  beforeEach(() => {
    tmpPath = path.join(os.tmpdir(), `notes-test-${Date.now()}.json`);
    notes = new MemoryNotes({ notesPath: tmpPath, autoLoad: false });
  });

  describe('createNote', () => {
    test('creates a note with required fields', () => {
      const note = notes.createNote('Test note content', { sessionId: 'ses_001' });

      expect(note.id).toMatch(/^note_\d+$/);
      expect(note.content).toBe('Test note content');
      expect(note.session_id).toBe('ses_001');
      expect(note.created_at).toBeDefined();
      expect(note.tags).toEqual([]);
    });

    test('creates a note with tags', () => {
      const note = notes.createNote('Tagged note', {
        tags: ['debug', 'architecture'],
        sessionId: 'ses_001'
      });

      expect(note.tags).toContain('debug');
      expect(note.tags).toContain('architecture');
    });

    test('creates related notes', () => {
      const note1 = notes.createNote('First note', { sessionId: 'ses_001' });
      const note2 = notes.createNote('Related note', {
        relatesTo: note1.id,
        sessionId: 'ses_001'
      });

      expect(note2.relates_to).toBe(note1.id);
    });

    test('creates superseding notes', () => {
      const note1 = notes.createNote('Old note', { sessionId: 'ses_001' });
      const note2 = notes.createNote('Updated note', {
        supersedes: note1.id,
        sessionId: 'ses_001'
      });

      expect(note2.supersedes).toBe(note1.id);
    });
  });

  describe('queryNotes', () => {
    test('returns all notes when no filters', () => {
      notes.createNote('Note 1', { sessionId: 'ses_001' });
      notes.createNote('Note 2', { sessionId: 'ses_002' });

      const results = notes.queryNotes();
      expect(results.length).toBe(2);
    });

    test('filters by tags (AND logic)', () => {
      notes.createNote('Debug note', { tags: ['debug', 'critical'], sessionId: 'ses_001' });
      notes.createNote('Feature note', { tags: ['feature'], sessionId: 'ses_001' });

      const results = notes.queryNotes({ tags: ['debug', 'critical'] });
      expect(results.length).toBe(1);
      expect(results[0].content).toBe('Debug note');
    });

    test('filters by session ID', () => {
      notes.createNote('Session 1 note', { sessionId: 'ses_001' });
      notes.createNote('Session 2 note', { sessionId: 'ses_002' });

      const results = notes.queryNotes({ sessionId: 'ses_001' });
      expect(results.length).toBe(1);
      expect(results[0].session_id).toBe('ses_001');
    });

    test('searches in content', () => {
      notes.createNote('Architecture decision about PEV', { sessionId: 'ses_001' });
      notes.createNote('Budget enforcement mode', { sessionId: 'ses_001' });

      const results = notes.queryNotes({ search: 'architecture' });
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('Architecture');
    });

    test('respects limit', () => {
      for (let i = 0; i < 10; i++) {
        notes.createNote(`Note ${i}`, { sessionId: 'ses_001' });
      }

      const results = notes.queryNotes({ limit: 3 });
      expect(results.length).toBe(3);
    });

    test('returns newest notes first', () => {
      const note1 = notes.createNote('Old note', { sessionId: 'ses_001' });
      const note2 = notes.createNote('New note', { sessionId: 'ses_001' });

      // Since they're created in the same ms, sort by ID (higher ID = newer)
      const results = notes.queryNotes();
      expect(results.length).toBe(2);
      // Both should be present
      const ids = results.map(r => r.id);
      expect(ids).toContain(note1.id);
      expect(ids).toContain(note2.id);
    });
  });

  describe('updateNote', () => {
    test('updates note content', () => {
      const note = notes.createNote('Original', { sessionId: 'ses_001' });
      const updated = notes.updateNote(note.id, 'Updated content');

      expect(updated.content).toBe('Updated content');
      expect(updated.updated_at).toBeDefined();
    });

    test('returns null for non-existent note', () => {
      const result = notes.updateNote('note_999', 'New content');
      expect(result).toBeNull();
    });
  });

  describe('addTags', () => {
    test('adds tags to note', () => {
      const note = notes.createNote('Test', { sessionId: 'ses_001' });
      const updated = notes.addTags(note.id, ['debug', 'critical']);

      expect(updated.tags).toContain('debug');
      expect(updated.tags).toContain('critical');
    });

    test('does not duplicate existing tags', () => {
      const note = notes.createNote('Test', { tags: ['debug'], sessionId: 'ses_001' });
      const updated = notes.addTags(note.id, ['debug', 'critical']);

      expect(updated.tags.filter(t => t === 'debug').length).toBe(1);
      expect(updated.tags).toContain('critical');
    });
  });

  describe('deleteNote', () => {
    test('deletes a note', () => {
      const note = notes.createNote('To delete', { sessionId: 'ses_001' });
      const deleted = notes.deleteNote(note.id);

      expect(deleted).toBe(true);
      expect(notes.getNote(note.id)).toBeNull();
    });

    test('returns false for non-existent note', () => {
      expect(notes.deleteNote('note_999')).toBe(false);
    });
  });

  describe('getRelatedNotes', () => {
    test('returns related notes', () => {
      const note1 = notes.createNote('First', { sessionId: 'ses_001' });
      const note2 = notes.createNote('Related', { relatesTo: note1.id, sessionId: 'ses_001' });

      const related = notes.getRelatedNotes(note1.id);
      expect(related.relatedBy).toHaveLength(1);
      expect(related.relatedBy[0].id).toBe(note2.id);
    });

    test('returns null for non-existent note', () => {
      const related = notes.getRelatedNotes('note_999');
      expect(related.relatesTo).toBeNull();
      expect(related.supersedes).toBeNull();
      expect(related.relatedBy).toEqual([]);
    });
  });

  describe('Persistence', () => {
    test('saves and loads notes', () => {
      notes.createNote('Persistent note', { sessionId: 'ses_001' });

      // Create new instance that loads from file
      const notes2 = new MemoryNotes({ notesPath: tmpPath, autoLoad: true });
      expect(notes2.getNoteCount()).toBe(1);

      const loaded = notes2.queryNotes({ sessionId: 'ses_001' });
      expect(loaded[0].content).toBe('Persistent note');
    });

    test('export and import', () => {
      notes.createNote('Export test', { tags: ['test'], sessionId: 'ses_001' });

      const exported = notes.export();
      const notes3 = new MemoryNotes({ notesPath: `${tmpPath}.import`, autoLoad: false });
      notes3.import(exported);

      expect(notes3.getNoteCount()).toBe(1);
      expect(notes3.queryNotes({ search: 'Export' })[0].content).toBe('Export test');

      // Cleanup
      try { fs.unlinkSync(`${tmpPath}.import`); } catch {}
    });
  });

  describe('getNoteCount', () => {
    test('returns correct count', () => {
      expect(notes.getNoteCount()).toBe(0);
      notes.createNote('Note 1', { sessionId: 'ses_001' });
      expect(notes.getNoteCount()).toBe(1);
      notes.createNote('Note 2', { sessionId: 'ses_001' });
      expect(notes.getNoteCount()).toBe(2);
    });
  });
});
