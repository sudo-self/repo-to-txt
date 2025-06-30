# GitHub Repo to TXT

This web application allows you to fetch the directory structure and file contents of any public or private GitHub repository (with an optional Personal Access Token) and generate a combined plain text (.txt) file containing the contents of selected files.

## Features

- Enter any GitHub repository URL (including branch and path).
- Optional GitHub Personal Access Token (PAT) to access private repos or avoid rate limits.
- Fetch and display the entire repository directory structure as nested checkboxes.
- Select specific files or folders to include.
- Generate a single combined `.txt` file with the contents of selected files, separated by file path headers.
- Copy the generated text to clipboard.
- Download the generated text file.
- Download a ZIP archive of selected files.
- Responsive UI with collapsible folder tree and icons.
- Runs entirely in the browser — no data is stored or sent to any server.

## How to Use

1. **Enter the GitHub repository URL** in the input box. Examples:

https://github.com/username/repo
https://github.com/username/repo/tree/main
https://github.com/username/repo/tree/main/path/to/subdirectory


2. (Optional) **Enter a GitHub Personal Access Token (PAT)** if accessing private repositories or to increase API rate limits.

3. Click **Fetch Directory Structure**.

4. Once the repository tree loads, **select files or folders** you want included by checking their boxes. By default, common code files are preselected.

5. Click **Generate Text File** to fetch and combine the selected files' contents.

6. The combined text will appear in the text area below.

7. Use the **Copy to Clipboard** button to copy the text.

8. Use the **Download TXT** button to save the combined file.

9. Use the **Repo ZIP** button to download a ZIP archive of the selected files.

## Notes

- If you don't specify a branch/tag in the URL or the hidden inputs, it defaults to `main`.
- If you specify a subdirectory path, only that directory and its children will be fetched.
- The Personal Access Token is never stored or sent anywhere except GitHub API.
- The app handles GitHub API rate limits and will inform you if exceeded.
- Large repositories or many selected files may take longer to fetch and generate.

## Security

- This tool runs entirely client-side in your browser.
- Your GitHub Personal Access Token is only used for API requests directly to GitHub.
- No data is transmitted to or stored on any third-party server.

## Technologies Used

- [Tailwind CSS](https://tailwindcss.com/) for styling.
- [Lucide Icons](https://lucide.dev/) for UI icons.
- [GitHub REST API](https://docs.github.com/en/rest) to fetch repo contents and trees.
- [JSZip](https://stuk.github.io/jszip/) for ZIP file creation.
- Vanilla JavaScript for functionality.

## License

MIT License

---

Created by [sudo-self](https://github.com/sudo-self)
