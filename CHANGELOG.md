# Change Log

All notable changes to the "open-import-file" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

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