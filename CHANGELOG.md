# Change Log

All notable changes to the "open-import-file" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.2.0] - 2025-10-16

### Added
- Support for any file extension in import resolution. Previously, only predefined extensions (`.ts`, `.js`, `.tsx`, `.jsx`, `.json`, images, etc.) were recognized. Now media files (`.mp3`, `.webm`, `.mov`, etc.) and any other file types can be resolved and opened.
- **Monorepo support**: The extension now finds the nearest `tsconfig.json` by walking up the directory tree from the current file, enabling proper alias resolution in monorepo setups. Each package can have its own `tsconfig.json` with specific path aliases.

### Fixed
- Fixed an issue where the plugin failed to initialize when reopening a workspace while files were already open.
- Improved file resolution performance with smarter caching for tsconfig.json and webpack.config.js
- Improved file resolution performance by testing multiple file extensions in parallel instead of sequentially

### Changed
- Update repository location

## [0.1.1] - 2025-10-16

- Fixed resolving file paths starting with `@/` did not work correctly.

## [0.1.0] - 2025-10-15

- Initial release