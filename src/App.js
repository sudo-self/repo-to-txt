import React, { useState, useCallback } from "react";
import GitHubButton from 'react-github-btn';
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

const COMMON_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".py", ".cpp", ".html", ".css"];

function RepoToTxt() {
  const [repoUrl, setRepoUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [tokenInfoVisible, setTokenInfoVisible] = useState(false);
  const [directoryTree, setDirectoryTree] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [outputText, setOutputText] = useState("");
  const [fileSize, setFileSize] = useState(null);
  const [error, setError] = useState(null);

  const parseRepoUrl = (url) => {
    url = url.replace(/\/$/, "");
    const match = url.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/tree\/([^/]+)(\/(.+))?)?$/
    );
    if (!match) throw new Error("Invalid GitHub repository URL.");
    return { owner: match[1], repo: match[2], ref: match[4], path: match[6] };
  };

  const fetchRepoSha = async (owner, repo, ref, path, token) => {
    let apiPath = path || "";
    let url = `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`;
    if (ref) url += `?ref=${ref}`;
    const headers = { Accept: "application/vnd.github.object+json" };
    if (token) headers.Authorization = `token ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed to fetch SHA");
    const data = await res.json();
    return data.sha;
  };
    
    

  const fetchRepoTree = async (owner, repo, sha, token) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `token ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed to fetch tree");
    return (await res.json()).tree;
  };

  const buildDirectoryStructure = (tree) => {
    const structure = {};
    const autoSelected = new Set();

    tree.forEach((item) => {
      if (item.type !== "blob") return;
      const parts = item.path.split("/");
      let current = structure;
      parts.forEach((part, idx) => {
        if (!current[part]) {
          current[part] = idx === parts.length - 1 ? item : {};
        }
        current = current[part];
      });
      const isCommon = COMMON_EXTENSIONS.some(ext => item.path.toLowerCase().endsWith(ext));
      if (isCommon) autoSelected.add(item.path);
    });

    return { structure, autoSelected };
  };

  const sortContents = (contents) =>
    contents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setOutputText("");
    setFileSize(null);
    setDirectoryTree(null);
    setSelectedFiles(new Set());

    try {
      const { owner, repo, ref, path } = parseRepoUrl(repoUrl.trim());
      const sha = await fetchRepoSha(owner, repo, ref, path, accessToken.trim());
      const tree = await fetchRepoTree(owner, repo, sha, accessToken.trim());
      const sorted = sortContents(tree);
      const { structure, autoSelected } = buildDirectoryStructure(sorted);
      setDirectoryTree(structure);
      setSelectedFiles(autoSelected);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleSelection = (path, isDir = false, childrenPaths = []) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (isDir) {
        const allSelected = childrenPaths.every((p) => next.has(p));
        childrenPaths.forEach((p) => {
          if (allSelected) next.delete(p);
          else next.add(p);
        });
      } else {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      }
      return next;
    });
  };

  const getAllFilePaths = (node) => {
    if (!node) return [];
    if (node.type === "blob") return [node.path];
    return Object.values(node).flatMap(getAllFilePaths);
  };

  const DirectoryNode = ({ name, node, level = 0 }) => {
    const [collapsed, setCollapsed] = useState(false);
    const isDir = node.type !== "blob";
    const allPaths = isDir ? getAllFilePaths(node) : [];
    const isSelected = isDir
      ? allPaths.every((p) => selectedFiles.has(p))
      : selectedFiles.has(node.path);
    const checked = isSelected;

    return (
      <li className="mb-1" style={{ paddingLeft: level * 16 }}>
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={() =>
              toggleSelection(isDir ? null : node.path, isDir, allPaths)
            }
            onClick={(e) => e.stopPropagation()}
          />
          {isDir ? (
            <>
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="focus:outline-none"
                aria-label={collapsed ? "Expand folder" : "Collapse folder"}
              >
                {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <Folder size={16} />
              <span>{name}</span>
            </>
          ) : (
            <>
              <File size={16} />
              <span>{name}</span>
            </>
          )}
        </label>
        {isDir && !collapsed && (
          <ul className="ml-4 mt-1">
            {Object.entries(node).map(([childName, childNode]) => (
              <DirectoryNode
                key={childName}
                name={childName}
                node={childNode}
                level={level + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  };

  const fetchFileContents = useCallback(
    async (paths) => {
      const all = [];
      const pathToItem = {};
      const flatten = (node) => {
        if (node.type === "blob") pathToItem[node.path] = node;
        else Object.values(node).forEach(flatten);
      };
      flatten(directoryTree);
      for (const path of paths) {
        const file = pathToItem[path];
        const headers = accessToken ? { Authorization: `token ${accessToken}` } : {};
        const res = await fetch(file.url, { headers });
        const data = await res.json();
        const content =
          data.encoding === "base64"
            ? atob(data.content.replace(/\n/g, ""))
            : data.content;
        all.push({ path: file.path, content });
      }
      return all;
    },
    [directoryTree, accessToken]
  );

  const onGenerateText = async () => {
    try {
      if (!selectedFiles.size) throw new Error("No files selected.");
      const files = await fetchFileContents([...selectedFiles]);
      const output = files.map((f) => `// --- ${f.path} ---\n${f.content}`).join("\n\n");
      setOutputText(output);
    } catch (err) {
      setError(err.message);
    }
  };

  const fallbackCopy = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Fallback copy failed:", err);
    }
    document.body.removeChild(textarea);
  };

  const onCopy = () => {
    if (!outputText) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(outputText)
        .then(() => alert("Copied to clipboard!"))
        .catch(() => {
          fallbackCopy(outputText);
          alert("Used fallback copy method.");
        });
    } else {
      fallbackCopy(outputText);
      alert("Copied using fallback.");
    }
  };

  const onDownload = () => {
    const blob = new Blob([outputText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repo.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onZip = async () => {
    try {
      const zip = new JSZip();
      const flatten = (node, map = {}) => {
        if (node.type === "blob") map[node.path] = node;
        else Object.values(node).forEach((n) => flatten(n, map));
        return map;
      };
      const pathToItem = flatten(directoryTree);
      const headers = accessToken ? { Authorization: `token ${accessToken}` } : {};
      let totalSize = 0;
      for (const path of selectedFiles) {
        const file = pathToItem[path];
        const res = await fetch(file.url, { headers });
        const blob = await res.blob();
        zip.file(file.path, blob);
        totalSize += blob.size;
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "repo_files.zip";
      a.click();
      URL.revokeObjectURL(url);
      setFileSize(`ZIP: ${(totalSize / 1024).toFixed(2)} KB`);
    } catch (err) {
      setError(`Error creating ZIP: ${err.message}`);
    }
  };

  return (
    <>
          <div className="bg-repos max-w-5xl mx-auto mb-10 mt-12 px-6 py-4">

        <img src={logo} alt="Logo" className="App-logo mx-auto mb-4 max-h-40" />
        <div className="github-button mt-4 text-center">
          <GitHubButton href="https://github.com/sudo-self" data-size="large">Follow @sudo-self</GitHubButton><br />
          <GitHubButton href="https://github.com/sudo-self/repo-to-txt" data-icon="octicon-star" data-size="large">Star</GitHubButton>
        </div>
      </div>

      <form onSubmit={onSubmit} className="max-w-4xl mx-auto space-y-6">
        <input className="w-full p-3 rounded bg-black border border-gray-600 text-white font-mono"
          placeholder="https://github.com/username/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
        />
        <div className="text-sm text-white flex items-center space-x-2">
          <span>Access Token (optional)</span>
          <button type="button" onClick={() => setTokenInfoVisible(!tokenInfoVisible)}>{tokenInfoVisible ? <X size={14} /> : <Info size={14} />}</button>
        </div>
        {tokenInfoVisible && (
          <div className="text-blue-400 text-sm">
            <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
              <ExternalLink size={14} />
              <span>Generate Token</span>
            </a>
          </div>
        )}
        <input type="password" className="w-full p-3 rounded bg-black border border-gray-600 text-white font-mono"
          placeholder="Paste your token here"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
        <button type="submit" className="w-full bg-indigo-700 py-3 rounded text-white flex justify-center items-center space-x-2">
          <FolderSearch size={18} />
          <span>Repo Tree</span>
        </button>
      </form>
          <footer className="max-w-4xl mx-auto mt-8 mb-8 text-center">
            <a
              href="https://repo-to-txt.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <img
                src="https://img.shields.io/badge/repo%20to%20txt-pages%20dev-cyan"
                alt="repo-to-txt badge"
                className="mx-auto hover:opacity-80 transition-opacity duration-200"
              />
            </a>
          </footer>


      {error && (
        <div className="max-w-4xl mx-auto mt-4 text-red-400 font-semibold">
          {error}
        </div>
      )}

      {directoryTree && (
        <>
          <div className="max-w-4xl mx-auto mt-6 bg-black p-4 rounded overflow-auto max-h-96 text-sm text-gray-200">
            <ul>
              {Object.entries(directoryTree).map(([name, node]) => (
                <DirectoryNode key={name} name={name} node={node} />
              ))}
            </ul>
          </div>

          <div className="max-w-4xl mx-auto mt-6 space-y-4">
            <button type="button" className="w-full bg-green-700 text-white py-3 rounded flex justify-center items-center space-x-2" onClick={onGenerateText}>
              <FileText />
              <span>Create Text</span>
            </button>
            <textarea className="w-full bg-black text-white p-3 rounded font-mono" rows={10} readOnly value={outputText} />
            <div className="flex gap-2">
              <button type="button" className="flex-1 bg-indigo-600 text-white py-2 rounded flex justify-center items-center gap-1" onClick={onCopy}>
                <Copy /> COPY
              </button>
              <button type="button" className="flex-1 bg-cyan-600 text-white py-2 rounded flex justify-center items-center gap-1" onClick={onDownload}>
                <Download /> TXT
              </button>
              <button type="button" className="flex-1 bg-gray-600 text-white py-2 rounded flex justify-center items-center gap-1" onClick={onZip}>
                <Archive /> ZIP
              </button>
            </div>
            {fileSize && (
              <p className="text-xs text-gray-400 text-center">{fileSize}</p>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default RepoToTxt;



