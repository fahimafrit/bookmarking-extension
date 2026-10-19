INSTALL: chrome://extensions -> turn on Developer mode -> Load unpacked -> pick this unzipped folder.
Click the extension icon to open your library.
SHORTCUTS (change at chrome://extensions/shortcuts): Alt+B save / Alt+S snapshot / Alt+T timestamp
Right-click menu: "Save to my library", "Take video snapshot", "Mark timestamp".
Click a bookmark to open its link; use the three-dot menu for Add to / Move to / Delete / Details.
Bookmarks in a subfolder also appear in every parent folder (not in sibling or child folders). Add subfolders with the 📁＋ button on a selected folder or the "New subfolder" tile.
Sidebar: ▸/▾ expands a folder to show its subfolders and bookmarks; the ⋮ at the right of a folder has New subfolder / Rename / Delete.
FOLDERS: every bookmark lives in a folder (default "General"). Create/rename/delete folders and subfolders in the library sidebar; drag a card onto a folder to move it.
BACKUP: Export backup button in the library (save it in a Google Drive folder).

Folders are real links: middle-click or Ctrl+click opens a folder in a new tab (sidebar, folder icons, breadcrumb). The folder ⋮ menu also has "Open in new tab".

SELECT: click the Select button (between ＋ and ⋮) to show checkboxes; tick bookmarks / folders, then use Copy to / Move to / Delete in the bar. Done or Esc leaves select mode.
SAVING: the save box shows your folders like the library sidebar (▸ to expand, click a folder to select it; selected folders are highlighted). You can select several. Folders start collapsed except the path to the folder you last saved into.

CONTEXT MENU: right-click -> Bookmarking Extension. 'Save to my library ★' is filled when the page is already saved. Snapshot / timestamp entries show a count; hover for the list, click one to jump the video there.
CAPTURE PANEL: Alt+S / Alt+T open a panel that stays open so you can take many snapshots and add many moments; close it with ✕ or Esc.
SIDEBAR: drag the divider to resize (double-click resets), or use the round arrow on it to hide/show the sidebar.

UPDATING WITHOUT LOSING DATA: your library lives inside Chrome, attached to this extension. Removing the extension deletes it.
 1. Export backup (library page) before any update.
 2. Unzip the new version OVER the same folder, then click the refresh icon on the extension at chrome://extensions. Do NOT click Remove.
 3. Keep the "key" line in manifest.json: it keeps the extension ID, and therefore your data, the same.
If the library is ever empty, click Import and choose your backup file.

--- v3 additions ---
SIDEBAR: opening a folder expands it (and its parents) so its subfolders and bookmarks show. Select (top-right) never affects the sidebar; use a row's ⋮ -> Select to pick ONE sidebar row (then F2 / Delete work on it). No multi-select, copy or cut in the sidebar.
FOLDER LISTS (save box, Copy to / Move to dialogs): folders are collapsed by default; the whole strip left of the folder icon is the expand/collapse target, so stray clicks there never select a folder.
MAIN AREA: long folder names wrap. Folder cards and bookmark cards both have ⋮ with Select / Copy to / Move to / Rename / Delete.
SHORTCUTS (when not typing): Ctrl+C copy, Ctrl+X cut, Ctrl+V paste into the open folder, Delete -> recycle bin, F2 rename, Ctrl+A select all, Esc clear selection, Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo.
RECYCLE BIN: Delete never destroys; items and folders go to "Recycle bin" at the bottom of the sidebar (Restore / Delete forever / Empty bin). You can also drag a bookmark onto it.
TOASTS + UNDO: every action shows a message at the bottom-left ("A moved to B"); toasts stack smoothly. Undo/redo buttons sit at the top right (last 30 actions this session).

--- v3.1 ---
Selection is limited to one folder at a time: leaving a folder with items selected asks first, then deselects.
Delete, move, copy, paste, restore and delete-forever all ask for confirmation (and can be undone afterwards).
Cut/copy: Esc or the Cancel button on the paste bar clears the dimming. The selection clears after Ctrl+C / Ctrl+X so you can browse to another folder and paste.
"+ Folder" now opens a dialog with a name field and a folder tree to choose where it goes (no more typing "/").
All folder trees (sidebar, save box, Copy/Move dialogs) expand and collapse with an animation; menus and dialogs fade in.
NOTE: whether your library survives removing the extension is up to Chrome, not this code. Keep backups.
