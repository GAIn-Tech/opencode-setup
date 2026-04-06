/**
 * Structured Note-Taking for Memory Graph
 *
 * Extends the session-to-error memory graph with Note nodes for long-horizon context management.
 * Notes persist across session boundaries and can be queried by tags, session, or content.
 *
 * @module opencode-memory-notes
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_NOTES_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.opencode',
  'notes.json'
);

/**
 * Note node type for the memory graph.
 *
 * @typedef {Object} Note
 * @property {string} id - Unique note identifier
 * @property {string} content - Note content
 * @property {string[]} tags - Note tags for querying
 * @property {string} session_id - Session that created this note
 * @property {string} created_at - ISO timestamp
 * @property {string} [updated_at] - ISO timestamp of last update
 * @property {string} [supersedes] - ID of note this supersedes
 * @property {string} [relates_to] - ID of related note
 */

class MemoryNotes {
  /**
   * @param {object} [opts]
   * @param {string} [opts.notesPath] - Path to persist notes (default: ~/.opencode/notes.json)
   * @param {boolean} [opts.autoLoad] - Load persisted notes on construction (default: true)
   */
  constructor(opts = {}) {
    this._notesPath = opts.notesPath || DEFAULT_NOTES_PATH;
    /** @type {Map<string, Note>} */
    this._notes = new Map();
    this._nextId = 1;

    if (opts.autoLoad !== false) {
      try {
        this._load();
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn(`[MemoryNotes] Could not load persisted notes: ${err.message}`);
        }
      }
    }
  }

  /**
   * Create a new note.
   *
   * @param {string} content - Note content
   * @param {object} [options]
   * @param {string[]} [options.tags] - Note tags
   * @param {string} [options.sessionId] - Session ID
   * @param {string} [options.relatesTo] - ID of related note
   * @param {string} [options.supersedes] - ID of note this supersedes
   * @returns {Note}
   */
  createNote(content, options = {}) {
    const { tags = [], sessionId = null, relatesTo = null, supersedes = null } = options;

    const note = {
      id: `note_${this._nextId++}`,
      content,
      tags: Array.isArray(tags) ? tags : [tags],
      session_id: sessionId,
      created_at: new Date().toISOString(),
      updated_at: null,
      relates_to: relatesTo || null,
      supersedes: supersedes || null
    };

    this._notes.set(note.id, note);
    this._save();

    return note;
  }

  /**
   * Query notes by tags, session, or content.
   *
   * @param {object} [filters]
   * @param {string[]} [filters.tags] - Filter by tags (AND logic)
   * @param {string} [filters.sessionId] - Filter by session ID
   * @param {string} [filters.search] - Search in content (case-insensitive)
   * @param {number} [filters.limit] - Max results (default: 50)
   * @returns {Note[]}
   */
  queryNotes(filters = {}) {
    const { tags = [], sessionId = null, search = null, limit = 50 } = filters;

    let results = [...this._notes.values()];

    // Filter by tags (AND logic)
    if (tags.length > 0) {
      results = results.filter(note =>
        tags.every(tag => note.tags.includes(tag))
      );
    }

    // Filter by session
    if (sessionId) {
      results = results.filter(note => note.session_id === sessionId);
    }

    // Search in content
    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter(note =>
        note.content.toLowerCase().includes(searchLower)
      );
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return results.slice(0, limit);
  }

  /**
   * Update a note's content.
   *
   * @param {string} noteId - Note ID
   * @param {string} content - New content
   * @returns {Note|null} Updated note or null if not found
   */
  updateNote(noteId, content) {
    const note = this._notes.get(noteId);
    if (!note) return null;

    note.content = content;
    note.updated_at = new Date().toISOString();
    this._save();

    return note;
  }

  /**
   * Add tags to a note.
   *
   * @param {string} noteId - Note ID
   * @param {string[]} tags - Tags to add
   * @returns {Note|null} Updated note or null if not found
   */
  addTags(noteId, tags) {
    const note = this._notes.get(noteId);
    if (!note) return null;

    const existingTags = new Set(note.tags);
    for (const tag of tags) {
      existingTags.add(tag);
    }
    note.tags = [...existingTags];
    note.updated_at = new Date().toISOString();
    this._save();

    return note;
  }

  /**
   * Delete a note.
   *
   * @param {string} noteId - Note ID
   * @returns {boolean} True if deleted
   */
  deleteNote(noteId) {
    const deleted = this._notes.delete(noteId);
    if (deleted) this._save();
    return deleted;
  }

  /**
   * Get a note by ID.
   *
   * @param {string} noteId - Note ID
   * @returns {Note|null}
   */
  getNote(noteId) {
    return this._notes.get(noteId) || null;
  }

  /**
   * Get all notes.
   *
   * @returns {Note[]}
   */
  getAllNotes() {
    return [...this._notes.values()];
  }

  /**
   * Get note count.
   *
   * @returns {number}
   */
  getNoteCount() {
    return this._notes.size;
  }

  /**
   * Get notes related to a specific note.
   *
   * @param {string} noteId - Note ID
   * @returns {{ relatesTo: Note|null, supersedes: Note|null, relatedBy: Note[] }}
   */
  getRelatedNotes(noteId) {
    const note = this._notes.get(noteId);
    if (!note) return { relatesTo: null, supersedes: null, relatedBy: [] };

    const relatesTo = note.relates_to ? this._notes.get(note.relates_to) || null : null;
    const supersedes = note.supersedes ? this._notes.get(note.supersedes) || null : null;
    const relatedBy = [...this._notes.values()].filter(
      n => n.relates_to === noteId || n.supersedes === noteId
    );

    return { relatesTo, supersedes, relatedBy };
  }

  /**
   * Export notes to JSON string.
   *
   * @returns {string}
   */
  export() {
    const notes = [...this._notes.values()];
    return JSON.stringify({
      notes,
      nextId: this._nextId,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Import notes from JSON string.
   *
   * @param {string} json - JSON string from export()
   */
  import(json) {
    const data = JSON.parse(json);
    for (const note of data.notes) {
      this._notes.set(note.id, note);
    }
    if (data.nextId) this._nextId = data.nextId;
    this._save();
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Load notes from file.
   * @private
   */
  _load() {
    if (!fs.existsSync(this._notesPath)) return;

    const raw = fs.readFileSync(this._notesPath, 'utf-8');
    if (!raw || !raw.trim()) return;

    const data = JSON.parse(raw);
    for (const note of data.notes) {
      this._notes.set(note.id, note);
    }
    if (data.nextId) this._nextId = data.nextId;
  }

  /**
   * Save notes to file.
   * @private
   */
  _save() {
    try {
      const dir = path.dirname(this._notesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        notes: [...this._notes.values()],
        nextId: this._nextId,
        savedAt: new Date().toISOString()
      };

      // Atomic write: write to temp file then rename
      const tmpPath = `${this._notesPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this._notesPath);
    } catch (err) {
      console.warn(`[MemoryNotes] Failed to save notes (non-fatal): ${err.message}`);
    }
  }
}

module.exports = { MemoryNotes };
