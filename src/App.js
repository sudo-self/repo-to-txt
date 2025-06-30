import React, { useState, useEffect, useCallback } from "react";
import JSZip from "jszip";
import {
  FolderSearch,
  FileText,
  Copy,
  Download,
  Archive,
  Info,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Folder,
  File,
} from "lucide-react";
import logo from "./logo.svg";
import "./App.css";

const BG_IMAGE =
  "https://pub-c1de1cb456e74d6bbbee111ba9e6c757.r2.dev/gd.jpg";
const ICON_IMAGE =
  "https://pub-c1de1cb456e74d6bbbee111ba9e6c757.r2.dev/icon.png";

function RepoToTxt() {
  const [repoUrl, setRepoUrl] = useState("");
  const [ref, setRef] = useState("");
  const [path, setPath] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [tokenInfoVisible, setTokenInfoVisible] = useState(false);

  const [directoryTree, setDirectoryTree] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [outputText, setOutputText] = useState("");
  const [fileSize, setFileSize] = useState(null);
  const [error, setError] = useState(null);

  // Parse URL helper
  const parseRepoUrl = (url) => {
    url = url.replace(/\/$/, "");
    const urlPattern =
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(\/tree\/([^\/]+)(\/(.+))?)?$/;
    const match = url.match(urlPattern);
    if (!match) {
      throw new Error(
        "Invalid GitHub repository URL. Format: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/path"
      );
    }
    return {
      owner: match[1],
      repo: match[2],
      refFromUrl: match[4],
      pathFromUrl: match[6],
    };
  };

  // Fetch repo SHA
  const fetchRepoSha = async (owner, repo, refParam, pathParam, token) => {
    let apiPath = pathParam ? `${pathParam}` : "";
    let url = `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`;
    if (refParam) url += `?ref=${refParam}`;

    const headers = { Accept: "application/vnd.github.object+json" };
    if (token) headers.Authorization = `token ${token}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (
        response.status === 403 &&
        response.headers.get("X-RateLimit-Remaining") === "0"
      ) {
        throw new Error(
          "GitHub API rate limit exceeded. Try later or use a valid access token."
        );
      }
      if (response.status === 404) {
        throw new Error(
          "Repository, branch, or path not found. Check URL, branch/tag, and path."
        );
      }
      throw new Error(`Failed to fetch repository SHA. Status: ${response.status}`);
    }
    const data = await response.json();
    return data.sha;
  };

  // Fetch repo tree
  const fetchRepoTree = async (owner, repo, sha, token) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `token ${token}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (
        response.status === 403 &&
        response.headers.get("X-RateLimit-Remaining") === "0"
      ) {
        throw new Error(
          "GitHub API rate limit exceeded. Try later or use a valid access token."
        );
      }
      throw new Error(`Failed to fetch repository tree. Status: ${response.status}`);
    }
    const data = await response.json();
    return data.tree;
  };

  // Sort by path
  const sortContents = (contents) => {
    return contents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  };

  // Build tree structure from flat list
  const buildDirectoryStructure = (tree) => {
    const directoryStructure = {};
    tree.forEach((item) => {
      if (item.type !== "blob") return;
      const pathParts = item.path.split("/");
      let currentLevel = directoryStructure;
      pathParts.forEach((part, idx) => {
        if (!currentLevel[part]) {
          currentLevel[part] = idx === pathParts.length - 1 ? item : {};
        }
        currentLevel = currentLevel[part];
      });
    });
    return directoryStructure;
  };

  // Handle form submit
  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setOutputText("");
    setFileSize(null);
    setDirectoryTree(null);
    setSelectedFiles(new Set());

    try {
      const { owner, repo, refFromUrl, pathFromUrl } = parseRepoUrl(repoUrl.trim());
      const finalRef = ref || refFromUrl || "main";
      const finalPath = path || pathFromUrl || "";

      const sha = await fetchRepoSha(owner, repo, finalRef, finalPath, accessToken.trim());
      const tree = await fetchRepoTree(owner, repo, sha, accessToken.trim());

      setDirectoryTree(buildDirectoryStructure(sortContents(tree)));
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle directory/file selection
  const toggleSelection = (path, isDir = false, childrenPaths = []) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (isDir) {
        // Select/deselect all children
        const allSelected = childrenPaths.every((p) => newSet.has(p));
        childrenPaths.forEach((p) => {
          if (allSelected) newSet.delete(p);
          else newSet.add(p);
        });
      } else {
        if (newSet.has(path)) newSet.delete(path);
        else newSet.add(path);
      }
      return newSet;
    });
  };

  // Recursively get all file paths in directory structure for selection toggling
  const getAllFilePaths = (node) => {
    if (!node) return [];
    if (node.type === "blob") return [node.path];
    return Object.values(node).flatMap(getAllFilePaths);
  };

  // Render directory tree recursively
  const DirectoryNode = ({ name, node, level = 0 }) => {
    const [collapsed, setCollapsed] = useState(false);

    const isDirectory = node.type !== "blob";

    // For directories, get all file paths inside for selection toggling
    const allFilePaths = isDirectory ? getAllFilePaths(node) : [];

    const isSelected = isDirectory
      ? allFilePaths.every((p) => selectedFiles.has(p))
      : selectedFiles.has(node.path);

    const commonExtensions = [
      ".js",
      ".py",
      ".java",
      ".cpp",
      ".html",
      ".css",
      ".ts",
      ".jsx",
      ".tsx",
    ];
    const isCommonFile =
      !isDirectory &&
      commonExtensions.some((ext) => node.path.toLowerCase().endsWith(ext));

    // Checkbox checked by default if common file
    const checked = isDirectory
      ? isSelected
      : selectedFiles.has(node.path) || (isCommonFile && !selectedFiles.has(node.path));

    return (
      <li className="mb-1" style={{ paddingLeft: level * 16 }}>
        <label className="flex items-center space-x-2 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={() =>
              toggleSelection(isDirectory ? null : node.path, isDirectory, allFilePaths)
            }
            className={isDirectory ? "mr-2 directory-checkbox" : "mr-2"}
          />
          {isDirectory ? (
            <>
              <button
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "Expand directory" : "Collapse directory"}
                className="focus:outline-none"
                type="button"
              >
                {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <Folder className="inline-block mr-1" size={16} />
              <span>{name}</span>
            </>
          ) : (
            <>
              <File className="inline-block mr-1" size={16} />
              <span>{name}</span>
            </>
          )}
        </label>
        {isDirectory && !collapsed && (
          <ul className="ml-6 mt-1 list-disc">
            {Object.entries(node).map(([childName, childNode]) => (
              <DirectoryNode key={childName} name={childName} node={childNode} level={level + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  // Fetch file contents for selected files
  const fetchFileContents = useCallback(
    async (selectedFilePaths) => {
      if (!directoryTree) return [];

      const allFiles = [];

      const pathToItem = {};
      // Flatten directoryTree for quick lookup by path
      const flattenTree = (node) => {
        if (node.type === "blob") {
          pathToItem[node.path] = node;
          return;
        }
        Object.values(node).forEach(flattenTree);
      };
      flattenTree(directoryTree);

      for (const path of selectedFilePaths) {
        if (!pathToItem[path]) continue;
        allFiles.push(pathToItem[path]);
      }

      const headers = accessToken ? { Authorization: `token ${accessToken}` } : {};
      const results = [];

      for (const file of allFiles) {
        const response = await fetch(file.url, { headers });
        if (!response.ok) throw new Error(`Failed to fetch file: ${file.path}`);
        const data = await response.json();

        let content = "";
        if (data.encoding === "base64") {
          content = atob(data.content.replace(/\n/g, ""));
        } else {
          content = data.content;
        }
        results.push({ path: file.path, content });
      }

      return results;
    },
    [directoryTree, accessToken]
  );

  // Format contents into text
  const formatRepoContents = (files) => {
    let text = "";
    files.forEach((file) => {
      text += `// --- ${file.path} ---\n`;
      text += file.content + "\n\n";
    });
    return text;
  };

  // Handle generate text
  const onGenerateText = async () => {
    setError(null);
    setOutputText("");
    setFileSize(null);

    try {
      if (selectedFiles.size === 0) throw new Error("No files selected");

      const files = await fetchFileContents(Array.from(selectedFiles));
      const formatted = formatRepoContents(files);
      setOutputText(formatted);
    } catch (err) {
      setError(
        `Error generating text file: ${err.message}\n\nPlease ensure:\n1. You have selected at least one file.\n2. Your access token (if provided) is valid.\n3. Stable internet connection.\n4. GitHub API is accessible.`
      );
    }
  };

  // Copy outputText to clipboard
  const onCopy = () => {
    navigator.clipboard.writeText(outputText).catch(() => alert("Failed to copy to clipboard"));
  };

  // Download outputText as .txt file
  const onDownload = () => {
    if (!outputText.trim()) {
      alert("No content to download. Please generate the text file first.");
      return;
    }
    const blob = new Blob([outputText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repo.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Create ZIP of selected files
  const onZip = async () => {
    if (selectedFiles.size === 0) {
      alert("Please select at least one file.");
      return;
    }
    setError(null);
    setFileSize(null);

    try {
      const zip = new JSZip();
      const headers = accessToken ? { Authorization: `token ${accessToken}` } : {};
      let totalSize = 0;

      const pathToItem = {};
      const flattenTree = (node) => {
        if (node.type === "blob") {
          pathToItem[node.path] = node;
          return;
        }
        Object.values(node).forEach(flattenTree);
      };
      flattenTree(directoryTree);

      for (const path of selectedFiles) {
        const file = pathToItem[path];
        if (!file) continue;

        const response = await fetch(file.url, { headers });
        if (!response.ok)
          throw new Error(`Failed to fetch ${file.path} (status ${response.status})`);
        const blob = await response.blob();
        zip.file(file.path, blob);
        totalSize += blob.size;
      }

      setFileSize(`ZIP size: ${(totalSize / 1024).toFixed(2)} KB`);
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "repo_files.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Error creating ZIP: ${err.message}`);
    }
  };

  return (
    <>
      <style>{`
        body {
          background-color: #1a202c;
          color: #e2e8f0;
        }
      `}</style>
      <div
        className="max-w-4xl mx-auto rounded-2xl shadow-lg p-8 relative bg-cover bg-center mb-6"
        style={{ backgroundImage: `url(${BG_IMAGE})` }}
      >
        <div className="flex flex-col items-center mb-6">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="text-4xl font-extrabold text-center">GitHub Repo to TXT</h1>
          <img
            src="https://img.shields.io/badge/repo-txt-blue"
            alt="Badge"
            className="mt-4"
          />
        </div>
        <div className="flex justify-center mt-4">
          <a
            className="github-button"
            href="https://github.com/sudo-self/repo-to-txt"
            data-icon="octicon-star"
            data-size="large"
            aria-label="Star sudo-self/repo-to-txt on GitHub"
            target="_blank"
            rel="noopener noreferrer"
          >
            Star
          </a>
        </div>
      </div>

      <form
        className="max-w-4xl mx-auto mt-8 space-y-6"
        onSubmit={onSubmit}
        noValidate
      >
        <div>
          <label htmlFor="repoUrl" className="block text-sm font-semibold mb-1">
            GitHub URL
          </label>
          <input
            type="text"
            id="repoUrl"
            name="repoUrl"
            required
            placeholder="https://github.com/username/repo"
            className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:border-blue-400 focus:ring focus:ring-blue-300"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
        </div>

        {/* Hidden inputs ref and path - keep for future use */}
        <input
          type="hidden"
          id="ref"
          name="ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
        />
        <input
          type="hidden"
          id="path"
          name="path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />

        <div>
          <label
            htmlFor="accessToken"
            className="block text-sm font-semibold mb-1 flex items-center gap-2"
          >
            Personal Access Token (optional)
            <button
              type="button"
              onClick={() => setTokenInfoVisible((v) => !v)}
              className="text-blue-400 hover:text-blue-300"
              aria-label="Toggle token info"
            >
              {tokenInfoVisible ? <X size={16} /> : <Info size={16} />}
            </button>
          </label>
          {tokenInfoVisible && (
            <div className="mt-2 text-sm text-gray-400">
              <p>This runs in your browser. No data is stored.</p>
              <a
                href="https://github.com/settings/tokens/new?description=repo2file&scopes=repo"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center mt-1 text-blue-400 hover:text-blue-300"
              >
                <ExternalLink size={16} className="mr-1" />
                Get your token
              </a>
            </div>
          )}
          <input
            type="text"
            id="accessToken"
            name="accessToken"
            className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:border-blue-400 focus:ring focus:ring-blue-300"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="w-full bg-green-700 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center"
          aria-label="Fetch Directory Structure"
        >
          <FolderSearch className="w-5 h-5 mr-2" />
          Fetch Directory Structure
        </button>
      </form>

      {error && (
        <div className="max-w-4xl mx-auto mt-6 text-red-500 whitespace-pre-wrap">{error}</div>
      )}

      {directoryTree && (
        <>
          <div
            id="directoryStructure"
            className="max-w-4xl mx-auto mt-8 bg-gray-800 p-4 rounded-lg overflow-auto max-h-96"
          >
            <ul>
              {Object.entries(directoryTree).map(([name, node]) => (
                <DirectoryNode key={name} name={name} node={node} />
              ))}
            </ul>
          </div>

          <div className="max-w-4xl mx-auto mt-6 flex flex-col items-center">
            <button
              onClick={onGenerateText}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center"
              type="button"
              aria-label="Generate Text File"
            >
              <FileText className="w-5 h-5 mr-2" />
              Generate Text File
            </button>

            <textarea
              id="outputText"
              rows={15}
              className="w-full mt-6 p-4 bg-gray-700 border border-gray-600 rounded-lg font-mono text-gray-100"
              readOnly
              value={outputText}
              placeholder="Generated text will appear here..."
            />

            <div className="w-full flex flex-col md:flex-row gap-4 mt-4">
              <button
                onClick={onCopy}
                className={`flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center ${
                  outputText ? "block" : "hidden"
                }`}
                type="button"
                aria-label="Copy to Clipboard"
              >
                <Copy className="w-5 h-5 mr-2" />
                Copy to Clipboard
              </button>
              <button
                onClick={onDownload}
                className={`flex-1 bg-cyan-500 hover:bg-cyan-800 text-white font-semibold py-3 rounded-lg flex items-center justify-center ${
                  outputText ? "block" : "hidden"
                }`}
                type="button"
                aria-label="Download TXT"
              >
                <Download className="w-5 h-5 mr-2" />
                Download TXT
              </button>
              <button
                onClick={onZip}
                className={`flex-1 bg-gray-500 hover:bg-gray-800 text-white font-semibold py-3 rounded-lg flex items-center justify-center ${
                  directoryTree ? "block" : "hidden"
                }`}
                type="button"
                aria-label="Download Repo ZIP"
              >
                <Archive className="w-5 h-5 mr-2" />
                Repo ZIP
              </button>
            </div>

            {fileSize && (
              <div id="fileSize" className="text-sm mt-2 text-gray-400">
                {fileSize}
              </div>
            )}
          </div>
        </>
      )}

      {/* GitHub buttons script */}
      <script async defer src="https://buttons.github.io/buttons.js"></script>
    </>
  );
}

export default RepoToTxt;

