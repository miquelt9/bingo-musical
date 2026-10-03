# Design

Windows 9x chrome from `@miquelt9/pc-ui`: squared corners, beveled edges, flat system colors, Source Code Pro. This app does not own that look. Do not add rounded glass, gradients, or a second palette.

## Tokens

Theme with pc-ui's `--pc-*` properties. Tailwind color utilities alias those tokens (`tailwind.config.js`). `src/index.css` may add app layout variables (`--pc-taskbar-height`, workspace insets). Do not fork a pc-ui component to restyle it.

The stored theme is `light`, `dark`, or `system` (`bingo-musical:pc-theme` in `localStorage`). When nothing is stored, the theme is `system`. `src/state/ThemeContext.tsx` and the inline script in `index.html` set `data-pc-theme` and `.pc-theme-*` on `<html>` before paint.

Light title bars in this app stay `#2B6CB0`. The override in `src/index.css` is intentional: pc-ui's light `--pc-titlebar-bg` is `#1E5AA8`. Leave it. Dark, and system when the OS prefers dark, keep pc-ui's Night Win9x title bar.

## Shell

The desktop shell is pc-ui `Desktop`, `Window`, and `Taskbar`. At 639px and below the taskbar is hidden, and section links sit in the page header (`PageHeader`, `MobileSectionNav`) using the same bevel and button language. The audience display (`#/deck/:id/display`) is outside the shell so a projector does not show host chrome.

Shell icons are Lucide. Print rules in `src/index.css` are for bingo cards. Leave window chrome off the paper.

## No look drift

New UI uses the existing tokens, bevels, and pc-ui controls (`Button`, `Window`, `ContentModal`, `OverflowMenu`, `Taskbar`). A visual redesign (palette, corner radius, density, or a different chrome metaphor) is out of scope unless the task asks. Layout changes are their own task.
