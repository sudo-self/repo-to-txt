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
import logo from "./logo.svg";
import "./App.css";

const BG_IMAGE =
  "https://pub-c1de1cb456e74d6bbbee111ba9e6c757.r2.dev/gd.jpg";

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

  const parseRepoUrl = (url) => {
    url = url.replace(/\/$/, "");
    const urlPattern =
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/tree\/([^/]+)(\/([^/]+))?)?$/;
    const match = url.match(urlPattern);
    if (!match) throw new Error("Invalid GitHub URL");
    return {
      owner: match[1],
      repo: match[2],
      refFromUrl: match[4],
      pathFromUrl: match[6],
    };
  };

  const fetchRepoSha = async (owner, repo, refParam, pathParam, token) => {
    let apiPath = pathParam || "";
    let url = `https://api.github.com/repos/${owner}/${repo}/contents/${apiPath}`;
    if (refParam) url += `?ref=${refParam}`;
    const headers = { Accept: "application/vnd.github.object+json" };
    if (token) headers.Authorization = `token ${token}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch SHA: ${response.status}`);
    const data = await response.json();
    return data.sha;
  };

  const fetchRepoTree = async (owner, repo, sha, token) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `token ${token}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Failed to fetch tree: ${response.status}`);
    const data = await response.json();
    return data.tree;
  };

  const sortContents = (contents) => contents.sort((a, b) => a.path.localeCompare(b.path));

  const buildDirectoryStructure = (tree) => {
    const structure = {};
    tree.forEach((item) => {
      if (item.type !== "blob") return;
      const parts = item.path.split("/");
      let current = structure;
      parts.forEach((part, i) => {
        if (!current[part]) {
          current[part] = i === parts.length - 1 ? item : {};
        }
        current = current[part];
      });
    });
    return structure;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setOutputText("");
    setFileSize(null);
    setDirectoryTree(null);
    setSelectedFiles(new Set());

    try {
      const { owner, repo, refFromUrl, pathFromUrl } = parseRepoUrl(repoUrl);
      const finalRef = ref || refFromUrl || "main";
      const finalPath = path || pathFromUrl || "";
      const sha = await fetchRepoSha(owner, repo, finalRef, finalPath, accessToken);
      const tree = await fetchRepoTree(owner, repo, sha, accessToken);
      setDirectoryTree(buildDirectoryStructure(sortContents(tree)));
    } catch (err) {
      setError(err.message);
    }
  };

  const getAllFilePaths = (node) => {
    if (!node) return [];
    if (node.type === "blob") return [node.path];
    return Object.values(node).flatMap(getAllFilePaths);
  };

  const toggleSelection = (path, isDir, children) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (isDir) {
        const allSelected = children.every((p) => newSet.has(p));
        children.forEach((p) => {
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

  const DirectoryNode = ({ name, node, level = 0 }) => {
    const [collapsed, setCollapsed] = useState(false);
    const isDir = node.type !== "blob";
    const allPaths = isDir ? getAllFilePaths(node) : [];
    const checked = isDir
      ? allPaths.every((p) => selectedFiles.has(p))
      : selectedFiles.has(node.path);

    return (
      <li style={{ paddingLeft: level * 16 }}>
        <label>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleSelection(isDir ? name : node.path, isDir, allPaths)}
          />
          {isDir ? (
            <>
              <button type="button" onClick={() => setCollapsed(!collapsed)}>
                {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <Folder size={16} /> {name}
            </>
          ) : (
            <>
              <File size={16} /> {name}
            </>
          )}
        </label>
        {isDir && !collapsed && (
          <ul>
            {Object.entries(node).map(([childName, childNode]) => (
              <DirectoryNode key={childName} name={childName} node={childNode} level={level + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  const fetchFileContents = useCallback(async (paths) => {
    if (!directoryTree) return [];
    const map = {};
    const flatten = (node) => {
      if (node.type === "blob") map[node.path] = node;
      else Object.values(node).forEach(flatten);
    };
    flatten(directoryTree);

    const headers = accessToken ? { Authorization: `token ${accessToken}` } : {};
    const results = [];

    for (const path of paths) {
      const file = map[path];
      const res = await fetch(file.url, { headers });
      const data = await res.json();
      const content = data.encoding === "base64"
        ? atob(data.content.replace(/\n/g, ""))
        : data.content;
      results.push({ path: file.path, content });
    }

    return results;
  }, [directoryTree, accessToken]);

  const formatRepoContents = (files) => {
    return files.map(file => `// --- ${file.path} ---\n${file.content}`).join("\n\n");
  };

  const onGenerateText = async () => {
    setError(null);
    setOutputText("");
    try {
      if (selectedFiles.size === 0) throw new Error("No files selected");
      const files = await fetchFileContents(Array.from(selectedFiles));
      const formatted = formatRepoContents(files);
      setOutputText(formatted);
    } catch (err) {
      setError(err.message);
    }
  };

  const onCopy = () => navigator.clipboard.writeText(outputText);

  const onDownload = () => {
    if (!outputText.trim()) return;
    const blob = new Blob([outputText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repo.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/repo" />
        <button type="submit">Fetch</button>
      </form>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {directoryTree && (
        <ul>
          {Object.entries(directoryTree).map(([name, node]) => (
            <DirectoryNode key={name} name={name} node={node} />
          ))}
        </ul>
      )}
      <button onClick={onGenerateText}>Generate Text</button>
      <button onClick={onCopy}>Copy</button>
      <button onClick={onDownload}>Download</button>
      <textarea value={outputText} readOnly rows={10} cols={80} />
    </div>
  );
}

export default RepoToTxt;
