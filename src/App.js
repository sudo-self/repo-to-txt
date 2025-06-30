import React, { useState, useCallback } from "react";
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
import "./App.css";

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
    return {
      owner: match[1],
      repo: match[2],
      ref: match[4],
      path: match[6],
    };
  };

  const fetchRepoSha = async (owner, repo, refParam, pathParam, token) => {
    let url = `https://api.github.com/repos/${owner}/${repo}/contents/${pathParam || ""}`;
    if (refParam) url += `?ref=${refParam}`;
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
    const data = await res.json();
    return data.tree;
  };

  const buildDirectoryStructure = (tree) => {
    const structure = {};
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
    });
    return structure;
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
      setDirectoryTree(buildDirectoryStructure(sortContents(tree)));
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
    const isCommon = !isDir && [".js", ".ts", ".jsx", ".tsx", ".py", ".cpp", ".html", ".css"].some(ext => node.path.endsWith(ext));
    const checked = isDir ? allPaths.every((p) => selectedFiles.has(p)) : selectedFiles.has(node.path) || isCommon;

    return (
      <li style={{ paddingLeft: level * 16 }}>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleSelection(node.path, isDir, allPaths)}
          />
          {isDir ? (
            <>
              <button type="button" onClick={() => setCollapsed(!collapsed)}>
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
          <ul className="ml-4">
            {Object.entries(node).map(([childName, childNode]) => (
              <DirectoryNode key={childName} name={childName} node={childNode} level={level + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  const fetchFileContents = useCallback(async (paths) => {
    const pathToItem = {};
    const flatten = (node) => {
      if (node.type === "blob") pathToItem[node.path] = node;
      else Object.values(node).forEach(flatten);
    };
    flatten(directoryTree);

    const headers = accessToken ? { Authorization: `token ${accessToken}` } : {};
    const all = [];

    for (const path of paths) {
      const file = pathToItem[path];
      const res = await fetch(file.url, { headers });
      const data = await res.json();
      const content = data.encoding === "base64"
        ? atob(data.content.replace(/\n/g, ""))
        : data.content;
      all.push({ path: file.path, content });
    }
    return all;
  }, [directoryTree, accessToken]);

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

  const onCopy = () => navigator.clipboard.writeText(outputText);
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
    const zip = new JSZip();
    const pathToItem = {};
    const flatten = (node) => {
      if (node.type === "blob") pathToItem[node.path] = node;
      else Object.values(node).forEach(flatten);
    };
    flatten(directoryTree);

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
  };

  return (
    <>
      <div className="max-w-4xl mx-auto p-6 rounded-xl shadow bg-cover bg-center mb-6" style={{ backgroundImage: "url('/gd.jpg')" }}>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">GitHub Repo to TXT</h1>
          <div className="flex justify-center mb-4">
            <div data-iframe-width="150" data-iframe-height="270" data-share-badge-id="c8de13c5-ae1d-42c3-8d2e-96cb8a0b2bc7" data-share-badge-host="https://www.credly.com"></div>
            <script type="text/javascript" async src="https://cdn.credly.com/assets/utilities/embed.js"></script>
          </div>
          <a
            href="https://github.com/sudo-self/repo-to-txt"
            className="text-white underline"
            target="_blank"
            rel="noreferrer"
          >
            ⭐ Star on GitHub
          </a>
        </div>
      </div>

      <form onSubmit={onSubmit} className="max-w-4xl mx-auto space-y-6">
        <input
          className="w-full p-3 rounded bg-gray-800 border border-gray-600 text-white"
          placeholder="https://github.com/user/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
        />
        <div className="text-sm text-white">
          Access Token (optional)
          <button type="button" onClick={() => setTokenInfoVisible(!tokenInfoVisible)}>
            {tokenInfoVisible ? <X size={14} /> : <Info size={14} />}
          </button>
          {tokenInfoVisible && (
            <div className="mt-1">
              <a
                href="https://github.com/settings/tokens/new"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400"
              >
                <ExternalLink size={14} className="inline mr-1" />
                Generate Token
              </a>
            </div>
          )}
        </div>
        <input
          className="w-full p-3 rounded bg-gray-800 border border-gray-600 text-white"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
        <button type="submit" className="w-full bg-green-600 py-3 rounded text-white flex justify-center items-center">
          <FolderSearch size={18} className="mr-2" />
          Fetch Directory
        </button>
      </form>

      {error && <div className="max-w-4xl mx-auto mt-4 text-red-400">{error}</div>}

      {directoryTree && (
        <>
          <div className="max-w-4xl mx-auto mt-6 bg-gray-900 p-4 rounded overflow-auto max-h-96 text-sm text-white">
            <ul>
              {Object.entries(directoryTree).map(([name, node]) => (
                <DirectoryNode key={name} name={name} node={node} />
              ))}
            </ul>
          </div>

          <div className="max-w-4xl mx-auto mt-6 space-y-4">
            <button className="w-full bg-green-500 text-white py-3 rounded flex justify-center" onClick={onGenerateText}>
              <FileText className="mr-2" />
              Generate Text
            </button>
            <textarea
              className="w-full bg-gray-800 text-white p-3 rounded"
              rows={10}
              readOnly
              value={outputText}
            />
            <div className="flex gap-2">
              <button className="flex-1 bg-blue-600 text-white py-2 rounded" onClick={onCopy}>
                <Copy className="mr-1 inline" />
                Copy
              </button>
              <button className="flex-1 bg-cyan-600 text-white py-2 rounded" onClick={onDownload}>
                <Download className="mr-1 inline" />
                Download .txt
              </button>
              <button className="flex-1 bg-gray-700 text-white py-2 rounded" onClick={onZip}>
                <Archive className="mr-1 inline" />
                ZIP
              </button>
            </div>
            {fileSize && <p className="text-xs text-gray-400">{fileSize}</p>}
          </div>
        </>
      )}
    </>
  );
}

export default RepoToTxt;

