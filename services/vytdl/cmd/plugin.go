package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// Third-party plugin management (sprint-0 model §6): plugins install into
// <home>/plugins/<id>/ via a pnpm project rooted at <home>/plugins. A failed
// install leaves a .pending marker with diagnostics; the daemon and the web
// runtime only load plugins without it.

var pluginCmd = &cobra.Command{
	Use:   "plugin",
	Short: "Manage third-party frontend plugins",
}

var pluginInstallCmd = &cobra.Command{
	Use:   "install <package-spec>",
	Short: "Install a plugin package (npm spec) into the plugin home",
	Args:  cobra.ExactArgs(1),
	RunE:  runPluginInstall,
}

var pluginListCmd = &cobra.Command{
	Use:   "list",
	Short: "List installed plugins",
	RunE:  runPluginList,
}

var pluginRemoveCmd = &cobra.Command{
	Use:   "remove <plugin-id>",
	Short: "Remove an installed plugin",
	Args:  cobra.ExactArgs(1),
	RunE:  runPluginRemove,
}

func init() {
	pluginInstallCmd.Flags().String("home", envStr("VYTDL_HOME", defaultHome()), "plugin home (same as serve)")
	pluginListCmd.Flags().String("home", envStr("VYTDL_HOME", defaultHome()), "plugin home (same as serve)")
	pluginRemoveCmd.Flags().String("home", envStr("VYTDL_HOME", defaultHome()), "plugin home (same as serve)")
	pluginCmd.AddCommand(pluginInstallCmd, pluginListCmd, pluginRemoveCmd)
	rootCmd.AddCommand(pluginCmd)
}

func pluginsRoot(home string) string { return filepath.Join(home, "plugins") }

type pluginManifest struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Engine  string `json:"engine"`
	Entry   string `json:"entry"`
}

func readManifest(dir string) (*pluginManifest, error) {
	data, err := os.ReadFile(filepath.Join(dir, "plugin.json"))
	if err != nil {
		return nil, err
	}
	var m pluginManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func runPluginInstall(cmd *cobra.Command, args []string) error {
	spec := args[0]
	home, _ := cmd.Flags().GetString("home")
	root := pluginsRoot(home)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create plugin home: %w", err)
	}

	// Install into an isolated pnpm project; --ignore-workspace stops pnpm
	// from walking up into unrelated package.json files.
	tmp := filepath.Join(root, ".install-tmp")
	_ = os.RemoveAll(tmp)
	if err := os.MkdirAll(tmp, 0o755); err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	if err := os.WriteFile(filepath.Join(tmp, "package.json"), []byte("{\"name\":\"vytdl-plugin-install\",\"private\":true}\n"), 0o644); err != nil {
		return err
	}

	fmt.Printf("Installing %s ...\n", spec)
	install := exec.Command("pnpm", "add", "--ignore-workspace", spec)
	install.Dir = tmp
	install.Stdout = os.Stdout
	install.Stderr = os.Stderr
	if err := install.Run(); err != nil {
		return fmt.Errorf("pnpm add failed: %w", err)
	}

	// Locate the installed package: scan node_modules (incl. @scope dirs)
	// for a package carrying a plugin.json with an id.
	candidates := []string{}
	nm := filepath.Join(tmp, "node_modules")
	if entries, err := os.ReadDir(nm); err == nil {
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), ".") {
				continue
			}
			if strings.HasPrefix(e.Name(), "@") {
				if subs, err := os.ReadDir(filepath.Join(nm, e.Name())); err == nil {
					for _, sub := range subs {
						candidates = append(candidates, filepath.Join(nm, e.Name(), sub.Name()))
					}
				}
			} else {
				candidates = append(candidates, filepath.Join(nm, e.Name()))
			}
		}
	}

	var src string
	for _, c := range candidates {
		if m, err := readManifest(c); err == nil && m.ID != "" {
			src = c
			break
		}
	}
	if src == "" {
		return fmt.Errorf("installed package carries no plugin.json with an id — not a vYtDL plugin")
	}

	m, _ := readManifest(src)
	if !strings.HasPrefix(m.Engine, "^1") && m.Engine != "1" {
		return fmt.Errorf("plugin %s requires engine %s, runtime is ^1", m.ID, m.Engine)
	}

	// Directory name = full plugin id (dots are fine; keeps lookup trivial).
	dest := filepath.Join(root, m.ID)
	if !strings.HasPrefix(m.ID, "vytdl.plugin.") {
		return fmt.Errorf("invalid plugin id %q (expected vytdl.plugin.<name>)", m.ID)
	}
	_ = os.RemoveAll(dest)
	// pnpm's file: installs create symlinks — resolve to real content so the
	// plugins dir is self-contained (rename would just move the link).
	if info, err := os.Lstat(src); err == nil && info.Mode()&os.ModeSymlink != 0 {
		if err := copyDir(src, dest); err != nil {
			return fmt.Errorf("stage plugin: %w", err)
		}
	} else if err := os.Rename(src, dest); err != nil {
		// cross-device rename fallback
		if err := copyDir(src, dest); err != nil {
			return fmt.Errorf("stage plugin: %w", err)
		}
	}
	fmt.Printf("Installed %s (%s v%s)\n   → %s\n", m.ID, m.Name, m.Version, dest)
	fmt.Println("Restart the daemon (or reload the UI) to load it.")
	return nil
}

func runPluginList(cmd *cobra.Command, args []string) error {
	home, _ := cmd.Flags().GetString("home")
	root := pluginsRoot(home)
	entries, err := os.ReadDir(root)
	if err != nil {
		fmt.Println("No plugins installed.")
		return nil
	}
	found := false
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") || e.Name() == "node_modules" {
			continue
		}
		m, err := readManifest(filepath.Join(root, e.Name()))
		if err != nil {
			fmt.Printf("- %s  [incomplete: %v]\n", e.Name(), err)
			continue
		}
		disabled := ""
		if _, err := os.Stat(filepath.Join(root, e.Name(), ".disabled")); err == nil {
			disabled = " [disabled]"
		}
		fmt.Printf("- %s  %s v%s%s\n", m.ID, m.Name, m.Version, disabled)
		found = true
	}
	if !found {
		fmt.Println("No plugins installed.")
	}
	return nil
}

func runPluginRemove(cmd *cobra.Command, args []string) error {
	id := args[0]
	home, _ := cmd.Flags().GetString("home")
	if strings.ContainsAny(id, "/\\") || !strings.HasPrefix(id, "vytdl.plugin.") {
		return fmt.Errorf("invalid plugin id %q", id)
	}
	dest := filepath.Join(pluginsRoot(home), id)
	if _, err := os.Stat(dest); err != nil {
		return fmt.Errorf("plugin %q is not installed", id)
	}
	if err := os.RemoveAll(dest); err != nil {
		return err
	}
	fmt.Printf("Removed %s\n", id)
	return nil
}

func copyDir(srcArg, dest string) error {
	src, err := filepath.EvalSymlinks(srcArg)
	if err != nil {
		return err
	}
	return filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dest, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o755)
	})
}
