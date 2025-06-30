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
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/tree\/([^/]+)(\/(.+))?)?$/;
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
        throw new Error("Repository, branch, or path not found.");
      }
      throw new Error(`Failed to fetch repository SHA. Status: ${response.status}`);
    }
    const data = await response.json();
    return data.sha;
  };

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
        throw new Error("GitHub API rate limit exceeded.");
      }
      throw new Error(`Failed to fetch repository tree. Status: ${response.status}`);
    }
    const data = await response.json();
    return data.tree;
  };

  const sortContents = (contents) =>
    contents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

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

    const common = [".js", ".ts", ".jsx", ".tsx", ".py", ".cpp", ".html", ".css"];
    const isCommon = !isDir && common.some((e) => node.path.toLowerCase().endsWith(e));
    const checked = isDir ? isSelected : selectedFiles.has(node.path) || isCommon;

    return (
      <li className="mb-1" style={{ paddingLeft: level * 16 }}>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={() =>
              toggleSelection(isDir ? null : node.path, isDir, allPaths)
            }
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
    try {
      const zip = new JSZip();
      const flatten = (node, pathToItem = {}) => {
        if (node.type === "blob") pathToItem[node.path] = node;
        else Object.values(node).forEach((n) => flatten(n, pathToItem));
        return pathToItem;
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
      <div className="max-w-4xl mx-auto p-6 rounded-xl shadow bg-cover bg-center mb-6" style={{ backgroundImage: `url(${BG_IMAGE})` }}>
        <div className="text-center">
          <img src={logo} alt="Logo" className="App-logo mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2">GitHub Repo to TXT</h1>
          <img src="https://img.shields.io/badge/repo-txt-blue" alt="badge" />
        </div>
        <div className="text-center mt-4">
          <a
            href="https://github.com/sudo-self/repo-to-txt"
            className="text-blue-300 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Star on GitHub
          </a>
        </div>
      </div>

      <form onSubmit={onSubmit} className="max-w-4xl mx-auto space-y-6">
        <input
          className="w-full p-3 rounded bg-gray-700 border border-gray-600 text-white"
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
          className="w-full p-3 rounded bg-gray-700 border border-gray-600 text-white"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
        <button type="submit" className="w-full bg-green-600 py-3 rounded text-white flex justify-center items-center">
          <FolderSearch size={18} className="mr-2" />
          Fetch Directory
        </button>
      </form>

      {error && (
        <div className="max-w-4xl mx-auto mt-4 text-red-400 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {directoryTree && (
        <>
          <div className="max-w-4xl mx-auto mt-6 bg-gray-800 p-4 rounded overflow-auto max-h-96 text-sm">
            <ul>
              {Object.entries(directoryTree).map(([name, node]) => (
                <DirectoryNode key={name} name={name} node={node} />
              ))}
            </ul>
          </div>
          <div className="max-w-4xl mx-auto mt-6 space-y-4">
            <button
              className="w-full bg-green-500 text-white py-3 rounded flex justify-center"
              onClick={onGenerateText}
            >
              <FileText className="mr-2" />
              Generate Text
            </button>
            <textarea
              className="w-full bg-gray-700 text-white p-3 rounded"
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
              <button className="flex-1 bg-gray-600 text-white py-2 rounded" onClick={onZip}>
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
