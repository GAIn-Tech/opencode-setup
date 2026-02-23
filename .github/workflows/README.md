# GitHub Actions Disabled

GitHub Actions workflows have been moved to `.github/workflows-disabled/` to prevent unintended execution during development.

To re-enable workflows:
1. Move files back from `.github/workflows-disabled/` to `.github/workflows/`
2. Or delete this README.md file

This was done to prevent:
- Accidental costs from API usage
- Rate limiting issues
- Unintended CI/CD execution during development