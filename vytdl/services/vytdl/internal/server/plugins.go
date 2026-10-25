package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Third-party plugin support (sprint-0 model §6): plugins installed under
// <home>/plugins/<id>/ each carry a plugin.json manifest. The daemon exposes
// the inventory and serves plugin files so the web runtime can load them;
// enable/disable is a marker file so the frontend recovery UI stays stateless.

type InstalledPlugin struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Version  string `json:"version"`
	Engine   string `json:"engine"`
	Entry    string `json:"entry"`
	Builtin  bool   `json:"builtin"`
	Disabled bool   `json:"disabled"`
	Pending  bool   `json:"pending"`
	Error    string `json:"error,omitempty"`
}

func (s *Server) pluginsRoot() string {
	return filepath.Join(s.cfg.HomeDir, "plugins")
}

// listInstalledPlugins scans <home>/plugins/*/plugin.json.
func (s *Server) listInstalledPlugins() []InstalledPlugin {
	root := s.pluginsRoot()
	out := []InstalledPlugin{}
	entries, err := os.ReadDir(root)
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") || e.Name() == "node_modules" {
			continue
		}
		id := e.Name()
		plug := InstalledPlugin{ID: id, Builtin: false}
		manifestBytes, err := os.ReadFile(filepath.Join(root, id, "plugin.json"))
		if err != nil {
			plug.Pending = true
			plug.Error = "missing plugin.json (install incomplete?)"
			out = append(out, plug)
			continue
		}
		var m struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			Version string `json:"version"`
			Engine  string `json:"engine"`
			Entry   string `json:"entry"`
		}
		if err := json.Unmarshal(manifestBytes, &m); err != nil {
			plug.Pending = true
			plug.Error = "invalid plugin.json: " + err.Error()
			out = append(out, plug)
			continue
		}
		if m.ID != "" {
			plug.ID = m.ID
		}
		plug.Name = m.Name
		plug.Version = m.Version
		plug.Engine = m.Engine
		plug.Entry = m.Entry
		if _, err := os.Stat(filepath.Join(root, id, ".disabled")); err == nil {
			plug.Disabled = true
		}
		out = append(out, plug)
	}
	return out
}

// pluginDir resolves the on-disk dir for an installed plugin id, rejecting
// path traversal (ids must be plain directory names).
func (s *Server) pluginDir(id string) (string, bool) {
	if id == "" || strings.ContainsAny(id, "/\\") || strings.Contains(id, "..") {
		return "", false
	}
	dir := filepath.Join(s.pluginsRoot(), id)
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return "", false
	}
	return dir, true
}

func (s *Server) handleListPlugins(w http.ResponseWriter, r *http.Request) {
	writeOK(w, s.listInstalledPlugins())
}

func (s *Server) handlePluginSetDisabled(enabled bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		dir, ok := s.pluginDir(id)
		if !ok {
			writeFail(w, http.StatusNotFound, "plugin not found")
			return
		}
		marker := filepath.Join(dir, ".disabled")
		if enabled {
			if err := os.Remove(marker); err != nil && !os.IsNotExist(err) {
				writeFail(w, http.StatusInternalServerError, err.Error())
				return
			}
		} else {
			if err := os.WriteFile(marker, []byte("disabled\n"), 0o644); err != nil {
				writeFail(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		writeOK(w, nil)
	}
}

// handlePluginFile serves one file from a plugin's directory (entry modules,
// assets). Paths are cleaned and confined to the plugin dir.
func (s *Server) handlePluginFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rel := r.PathValue("path")
	dir, ok := s.pluginDir(id)
	if !ok {
		writeFail(w, http.StatusNotFound, "plugin not found")
		return
	}
	if rel == "" || strings.Contains(rel, "..") {
		writeFail(w, http.StatusBadRequest, "invalid path")
		return
	}
	full := filepath.Join(dir, filepath.Clean("/"+rel))
	if !strings.HasPrefix(full, dir+string(os.PathSeparator)) {
		writeFail(w, http.StatusBadRequest, "invalid path")
		return
	}
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		writeFail(w, http.StatusNotFound, "file not found")
		return
	}
	switch filepath.Ext(full) {
	case ".js", ".mjs":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	case ".json":
		w.Header().Set("Content-Type", "application/json")
	case ".css":
		w.Header().Set("Content-Type", "text/css")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	http.ServeFile(w, r, full)
}

func (s *Server) registerPluginRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/plugins", s.handleListPlugins)
	mux.HandleFunc("POST /api/plugins/{id}/disable", s.handlePluginSetDisabled(false))
	mux.HandleFunc("POST /api/plugins/{id}/enable", s.handlePluginSetDisabled(true))
	mux.HandleFunc("GET /api/plugins/{id}/files/{path...}", s.handlePluginFile)
}
