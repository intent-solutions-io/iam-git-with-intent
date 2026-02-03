# GWI IDE Configuration Templates

> **Document**: 208-DR-TMPL-gwi-ide-configs
> **Epic**: EPIC 006 - AI Coding Assistant Enablement
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

IDE-agnostic configuration templates for integrating GWI with popular development environments.

---

## VS Code

### Workspace Settings

```json
// .vscode/settings.json
{
  // GWI Integration
  "gwi.enabled": true,
  "gwi.autoReviewOnSave": false,
  "gwi.reviewBeforeCommit": true,
  "gwi.complexityThreshold": 7,
  "gwi.showInlineWarnings": true,

  // Editor settings for consistency
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",

  // TypeScript
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,

  // Git integration
  "git.enableCommitSigning": false,
  "git.confirmSync": false,
  "git.autofetch": true,

  // Terminal
  "terminal.integrated.env.linux": {
    "GWI_AUTO_REVIEW": "true"
  },
  "terminal.integrated.env.osx": {
    "GWI_AUTO_REVIEW": "true"
  }
}
```

### Tasks Configuration

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "GWI: Local Review",
      "type": "shell",
      "command": "gwi review --local",
      "group": "test",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "GWI: Local Review (AI)",
      "type": "shell",
      "command": "gwi review --local --ai",
      "group": "test",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "GWI: Triage Current Branch",
      "type": "shell",
      "command": "gwi triage --local",
      "group": "test",
      "problemMatcher": []
    },
    {
      "label": "GWI: Pre-commit Gate",
      "type": "shell",
      "command": "gwi gate --check-only",
      "group": "test",
      "problemMatcher": []
    },
    {
      "label": "GWI: Install Hooks",
      "type": "shell",
      "command": "gwi hooks install",
      "group": "build",
      "problemMatcher": []
    }
  ]
}
```

### Keyboard Shortcuts

```json
// .vscode/keybindings.json (user level)
[
  {
    "key": "ctrl+shift+r",
    "command": "workbench.action.tasks.runTask",
    "args": "GWI: Local Review"
  },
  {
    "key": "ctrl+shift+g",
    "command": "workbench.action.tasks.runTask",
    "args": "GWI: Pre-commit Gate"
  }
]
```

### Extensions Recommendations

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "github.copilot",
    "anthropic.claude-code"
  ],
  "unwantedRecommendations": []
}
```

---

## JetBrains (IntelliJ IDEA, WebStorm, PyCharm)

### Project Settings

```xml
<!-- .idea/gwi.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="GWISettings">
    <option name="enabled" value="true" />
    <option name="autoReviewOnSave" value="false" />
    <option name="reviewBeforeCommit" value="true" />
    <option name="complexityThreshold" value="7" />
    <option name="showInlineWarnings" value="true" />
  </component>
</project>
```

### External Tools

```xml
<!-- .idea/tools/GWI.xml -->
<toolSet name="GWI">
  <tool name="Local Review" description="Run GWI local review" showInMainMenu="true" showInEditor="true" showInProject="true" showInSearchPopup="true">
    <exec>
      <option name="COMMAND" value="gwi" />
      <option name="PARAMETERS" value="review --local" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
  <tool name="Local Review (AI)" description="Run GWI local review with AI" showInMainMenu="true" showInEditor="true" showInProject="true" showInSearchPopup="true">
    <exec>
      <option name="COMMAND" value="gwi" />
      <option name="PARAMETERS" value="review --local --ai" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
  <tool name="Pre-commit Gate" description="Run GWI gate check" showInMainMenu="true" showInEditor="true" showInProject="true" showInSearchPopup="true">
    <exec>
      <option name="COMMAND" value="gwi" />
      <option name="PARAMETERS" value="gate --check-only" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
</toolSet>
```

### Run Configurations

```xml
<!-- .idea/runConfigurations/GWI_Review.xml -->
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="GWI Review" type="ShConfigurationType">
    <option name="SCRIPT_TEXT" value="gwi review --local --ai" />
    <option name="INDEPENDENT_SCRIPT_PATH" value="true" />
    <option name="SCRIPT_PATH" value="" />
    <option name="SCRIPT_OPTIONS" value="" />
    <option name="INDEPENDENT_SCRIPT_WORKING_DIRECTORY" value="true" />
    <option name="SCRIPT_WORKING_DIRECTORY" value="$PROJECT_DIR$" />
    <method v="2" />
  </configuration>
</component>
```

---

## Neovim

### Lua Configuration

```lua
-- lua/plugins/gwi.lua
return {
  -- GWI Integration Plugin (hypothetical)
  {
    "gwi/gwi.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
      require("gwi").setup({
        enabled = true,
        auto_review_on_save = false,
        review_before_commit = true,
        complexity_threshold = 7,
        show_inline_warnings = true,

        keymaps = {
          review_local = "<leader>gr",
          review_ai = "<leader>gR",
          triage = "<leader>gt",
          gate = "<leader>gg",
        },

        signs = {
          warning = "",
          error = "",
          info = "",
        },
      })
    end,
  },
}
```

### Standalone Keymaps (without plugin)

```lua
-- lua/config/keymaps.lua

-- GWI Commands
vim.keymap.set("n", "<leader>gr", function()
  vim.cmd("!gwi review --local")
end, { desc = "GWI Local Review" })

vim.keymap.set("n", "<leader>gR", function()
  vim.cmd("!gwi review --local --ai")
end, { desc = "GWI Local Review (AI)" })

vim.keymap.set("n", "<leader>gt", function()
  vim.cmd("!gwi triage --local")
end, { desc = "GWI Triage" })

vim.keymap.set("n", "<leader>gg", function()
  vim.cmd("!gwi gate --check-only")
end, { desc = "GWI Gate Check" })

-- Terminal integration
vim.keymap.set("n", "<leader>gT", function()
  vim.cmd("terminal gwi review --local --ai")
end, { desc = "GWI Review in Terminal" })
```

### Autocmds

```lua
-- lua/config/autocmds.lua

-- Run GWI review before git commit (via gitcommit filetype)
vim.api.nvim_create_autocmd("FileType", {
  pattern = "gitcommit",
  callback = function()
    -- Show GWI gate status in commit message
    local result = vim.fn.system("gwi gate --check-only --json 2>/dev/null")
    if vim.v.shell_error == 0 then
      local ok, data = pcall(vim.json.decode, result)
      if ok and data.passed then
        vim.notify("GWI Gate: ✓ All checks passed", vim.log.levels.INFO)
      else
        vim.notify("GWI Gate: ⚠ Issues found", vim.log.levels.WARN)
      end
    end
  end,
})
```

---

## Cursor / Windsurf / AI-Native IDEs

These IDEs have built-in AI but can still use GWI via CLI:

### Shell Aliases

```bash
# ~/.bashrc or ~/.zshrc

# GWI Shortcuts
alias gwr="gwi review --local"
alias gwra="gwi review --local --ai"
alias gwt="gwi triage --local"
alias gwg="gwi gate --check-only"
alias gwh="gwi hooks install"

# Combined workflow
function gwi-commit() {
  echo "Running GWI gate check..."
  if gwi gate --check-only; then
    echo "✓ Gate passed, committing..."
    git commit "$@"
  else
    echo "✗ Gate failed, fix issues first"
    return 1
  fi
}

# Pre-push check
function gwi-push() {
  echo "Running full GWI review..."
  if gwi review --local --ai; then
    echo "✓ Review passed, pushing..."
    git push "$@"
  else
    echo "✗ Review found issues"
    return 1
  fi
}
```

### Git Hooks (IDE-agnostic)

```bash
# .git/hooks/pre-commit (installed by gwi hooks install)
#!/bin/bash
gwi gate --check-only --quiet
if [ $? -ne 0 ]; then
  echo "GWI gate check failed. Run 'gwi gate' for details."
  exit 1
fi
```

```bash
# .git/hooks/pre-push
#!/bin/bash
gwi review --local --quick
if [ $? -ne 0 ]; then
  echo "GWI review found issues. Run 'gwi review --local' for details."
  exit 1
fi
```

---

## Emacs

### Configuration

```elisp
;; ~/.emacs.d/init.el or ~/.doom.d/config.el

;; GWI Integration
(defun gwi-review-local ()
  "Run GWI local review."
  (interactive)
  (compile "gwi review --local"))

(defun gwi-review-ai ()
  "Run GWI local review with AI."
  (interactive)
  (compile "gwi review --local --ai"))

(defun gwi-triage ()
  "Run GWI triage."
  (interactive)
  (compile "gwi triage --local"))

(defun gwi-gate ()
  "Run GWI gate check."
  (interactive)
  (compile "gwi gate --check-only"))

;; Keybindings
(global-set-key (kbd "C-c g r") 'gwi-review-local)
(global-set-key (kbd "C-c g R") 'gwi-review-ai)
(global-set-key (kbd "C-c g t") 'gwi-triage)
(global-set-key (kbd "C-c g g") 'gwi-gate)

;; Doom Emacs users
(map! :leader
      (:prefix ("g" . "git/gwi")
       :desc "GWI Review" "r" #'gwi-review-local
       :desc "GWI Review (AI)" "R" #'gwi-review-ai
       :desc "GWI Triage" "t" #'gwi-triage
       :desc "GWI Gate" "g" #'gwi-gate))
```

---

## Universal Configuration

### Environment Variables

```bash
# ~/.bashrc, ~/.zshrc, or ~/.profile

# GWI Configuration
export GWI_CONFIG_PATH="$HOME/.config/gwi"
export GWI_AUTO_REVIEW=true
export GWI_COMPLEXITY_THRESHOLD=7
export GWI_TELEMETRY_ENABLED=true
export GWI_TELEMETRY_ANONYMOUS=true

# API Keys (if self-hosted)
export GWI_API_URL="https://gwi.company.com/api"
export GWI_API_KEY="gwi_key_xxx"
```

### Global GWI Config

```yaml
# ~/.config/gwi/config.yaml
version: 1

defaults:
  complexity_threshold: 7
  auto_review: true
  review_on_save: false

hooks:
  pre_commit:
    enabled: true
    checks:
      - lint
      - format
      - secrets
  pre_push:
    enabled: true
    checks:
      - tests
      - complexity

telemetry:
  enabled: true
  anonymous: true

integrations:
  github:
    enabled: true
  gitlab:
    enabled: false
  jira:
    enabled: false
```

### Project-level Override

```yaml
# .gwi/config.yaml (in project root)
version: 1

# Override defaults for this project
complexity_threshold: 8
review_on_save: false

# Project-specific checks
hooks:
  pre_commit:
    checks:
      - lint
      - format
      - secrets
      - type-check  # Additional check for this project

# Custom patterns
ignore:
  - "**/*.generated.ts"
  - "**/migrations/**"
  - "vendor/**"
```

---

## Quick Setup Script

```bash
#!/bin/bash
# scripts/setup-gwi-ide.sh

echo "Setting up GWI IDE integration..."

# Detect IDE
if [ -d ".vscode" ]; then
  echo "VS Code detected"
  # Copy VS Code configs
  cp templates/.vscode/* .vscode/
elif [ -d ".idea" ]; then
  echo "JetBrains IDE detected"
  # Copy JetBrains configs
  cp templates/.idea/* .idea/
fi

# Install hooks
gwi hooks install

# Set up environment
if ! grep -q "GWI_AUTO_REVIEW" ~/.bashrc; then
  echo 'export GWI_AUTO_REVIEW=true' >> ~/.bashrc
fi

echo "✓ GWI IDE integration complete"
echo "Restart your IDE to apply changes"
```
