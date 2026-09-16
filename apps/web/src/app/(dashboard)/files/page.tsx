"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderPlus,
  History,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { SUPER_ADMIN_LEVEL_ROLES, SystemRole } from "@/lib/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blobPath: string;
  version: number;
  uploadedById: string;
  projectId: string | null;
  taskId: string | null;
  folderId: string | null;
  createdAt: string;
}

interface FolderItem {
  id: string;
  projectId: string;
  parentFolderId: string | null;
  name: string;
  createdById: string;
  createdAt: string;
  fileCount: number;
  folderCount: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectsListResponse {
  data: ProjectOption[];
}

interface CreateUploadUrlResponse {
  attachmentId: string;
  uploadUrl: string;
  blobPath: string;
}

interface DownloadUrlResponse {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
}

const FILES_QUERY_ROOT = ["files"] as const;
const FOLDERS_QUERY_ROOT = ["folders"] as const;
const DELETE_ROLES: SystemRole[] = [
  ...SUPER_ADMIN_LEVEL_ROLES,
  SystemRole.DEPARTMENT_MANAGER,
  SystemRole.TEAM_LEAD,
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const rounded = exponent === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${units[exponent]}`;
}

function formatUploadedBy(uploadedById: string): string {
  return uploadedById.length > 8 ? `${uploadedById.slice(0, 8)}…` : uploadedById;
}

export default function FilesPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canDelete = Boolean(role && DELETE_ROLES.includes(role));

  const [projectId, setProjectId] = useState("");
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isNewFileOpen, setIsNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [versionsFor, setVersionsFor] = useState<Attachment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1]!.id : null;

  const projectsQuery = useQuery({
    queryKey: ["projects", "for-files"],
    queryFn: () => api.get<ProjectsListResponse>("/projects?pageSize=200"),
  });
  const projects = projectsQuery.data?.data ?? [];

  function handleProjectChange(value: string) {
    setProjectId(value);
    setFolderStack([]);
  }

  const foldersQuery = useQuery({
    queryKey: [...FOLDERS_QUERY_ROOT, projectId, currentFolderId],
    queryFn: () =>
      api.get<FolderItem[]>(
        `/folders?projectId=${projectId}${currentFolderId ? `&parentFolderId=${currentFolderId}` : ""}`,
      ),
    enabled: !!projectId,
  });

  const filesQuery = useQuery({
    queryKey: [...FILES_QUERY_ROOT, "list", projectId, currentFolderId],
    queryFn: () =>
      api.get<Attachment[]>(
        `/files?projectId=${projectId}${currentFolderId ? `&folderId=${currentFolderId}` : ""}`,
      ),
    enabled: !!projectId,
  });

  const invalidateFolder = () => {
    queryClient.invalidateQueries({ queryKey: FILES_QUERY_ROOT });
    queryClient.invalidateQueries({ queryKey: FOLDERS_QUERY_ROOT });
  };

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<FolderItem>("/folders", { projectId, parentFolderId: currentFolderId, name }),
    onSuccess: () => {
      toast.success("Folder created.");
      setIsNewFolderOpen(false);
      setNewFolderName("");
      invalidateFolder();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to create folder.");
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/folders/${id}`),
    onSuccess: () => {
      toast.success("Folder deleted.");
      setDeleteFolderTarget(null);
      invalidateFolder();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete folder.");
    },
  });

  const createTextFileMutation = useMutation({
    mutationFn: ({ fileName, content }: { fileName: string; content: string }) =>
      api.post<Attachment>("/files/text", { projectId, folderId: currentFolderId, fileName, content }),
    onSuccess: () => {
      toast.success("File created.");
      setIsNewFileOpen(false);
      setNewFileName("");
      setNewFileContent("");
      invalidateFolder();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to create file.");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const mimeType = file.type || "application/octet-stream";
      const uploadUrlRes = await api.post<CreateUploadUrlResponse>("/files/upload-url", {
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        projectId,
        folderId: currentFolderId,
      });

      const putResponse = await fetch(uploadUrlRes.uploadUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": mimeType,
        },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error(`Storage upload failed with status ${putResponse.status}`);
      }
    },
    onSuccess: () => {
      toast.success("File uploaded successfully.");
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        toast.error(
          `Could not request an upload URL (${error.message}). The file entry may still have been recorded and will appear in the list.`,
        );
      } else {
        const message = error instanceof Error ? error.message : "Unknown error";
        toast.error(
          `File record was saved, but uploading the bytes to storage failed: ${message}. This is expected in a local environment without Azure Blob Storage configured.`,
        );
      }
    },
    onSettled: () => {
      invalidateFolder();
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => api.get<DownloadUrlResponse>(`/files/${id}/download-url`),
    onSuccess: (data) => {
      window.open(data.downloadUrl, "_blank");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to get a download link.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => {
      toast.success("File deleted.");
      setDeleteTarget(null);
      invalidateFolder();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete file.");
    },
  });

  const versionsQuery = useQuery({
    queryKey: [...FILES_QUERY_ROOT, "versions", versionsFor?.id],
    queryFn: () => api.get<Attachment[]>(`/files/${versionsFor?.id}/versions`),
    enabled: !!versionsFor,
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadMutation.mutate(file);
  };

  function openFolder(folder: FolderItem) {
    setFolderStack((stack) => [...stack, { id: folder.id, name: folder.name }]);
  }

  function jumpToBreadcrumb(index: number) {
    // index -1 means the project root.
    setFolderStack((stack) => (index < 0 ? [] : stack.slice(0, index + 1)));
  }

  const folders = foldersQuery.data ?? [];
  const files = filesQuery.data ?? [];
  const selectedProject = projects.find((project) => project.id === projectId);
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">File Management</h1>
          <p className="text-sm text-muted-foreground">
            Choose a project to browse, organize, and manage its files.
          </p>
        </div>
        {projectId && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsNewFolderOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              New Folder
            </Button>
            <Button variant="outline" onClick={() => setIsNewFileOpen(true)}>
              <FilePlus className="h-4 w-4" />
              New File
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
              <Upload className="h-4 w-4" />
              {uploadMutation.isPending ? "Uploading…" : "Upload File"}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-1.5 p-4">
          <Label htmlFor="project-select">Project</Label>
          <Select value={projectId} onValueChange={handleProjectChange}>
            <SelectTrigger id="project-select" className="w-full sm:w-80">
              <SelectValue placeholder={projectsQuery.isLoading ? "Loading projects…" : "Select a project"} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!projectId ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Folder className="h-8 w-8" />
            Select a project above to browse its files.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => jumpToBreadcrumb(-1)}
              className={
                folderStack.length === 0
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:underline"
              }
            >
              {selectedProject?.name ?? "Project"}
            </button>
            {folderStack.map((crumb, index) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => jumpToBreadcrumb(index)}
                  className={
                    index === folderStack.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:underline"
                  }
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          {foldersQuery.isLoading || filesQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : filesQuery.isError || foldersQuery.isError ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-destructive">
                Failed to load this folder. Please try again.
              </CardContent>
            </Card>
          ) : isEmpty ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                This folder is empty. Create a folder, add a file, or upload one to get started.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folders.map((folder) => (
                    <TableRow
                      key={folder.id}
                      className="cursor-pointer"
                      onClick={() => openFolder(folder)}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {folder.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">Folder</TableCell>
                      <TableCell className="text-muted-foreground">
                        {folder.fileCount + folder.folderCount === 0
                          ? "Empty"
                          : `${folder.fileCount + folder.folderCount} item${
                              folder.fileCount + folder.folderCount === 1 ? "" : "s"
                            }`}
                      </TableCell>
                      <TableCell colSpan={2} className="text-muted-foreground" />
                      <TableCell className="text-muted-foreground">
                        {format(new Date(folder.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteFolderTarget(folder)}
                            title="Delete folder"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {files.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {file.fileName}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{file.mimeType}</TableCell>
                      <TableCell className="text-muted-foreground">{formatBytes(file.sizeBytes)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">v{file.version}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground" title={file.uploadedById}>
                        {formatUploadedBy(file.uploadedById)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(file.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadMutation.mutate(file.id)}
                            disabled={downloadMutation.isPending}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setVersionsFor(file)}
                            title="Versions"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteTarget(file)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              Create a folder inside {folderStack.length > 0 ? folderStack[folderStack.length - 1]!.name : selectedProject?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="e.g. Contracts"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createFolderMutation.mutate(newFolderName.trim())}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              {createFolderMutation.isPending ? "Creating…" : "Create folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewFileOpen} onOpenChange={setIsNewFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
            <DialogDescription>
              Create a text file inside {folderStack.length > 0 ? folderStack[folderStack.length - 1]!.name : selectedProject?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-file-name">File name</Label>
              <Input
                id="new-file-name"
                value={newFileName}
                onChange={(event) => setNewFileName(event.target.value)}
                placeholder="e.g. meeting-notes.txt"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-file-content">Content (optional)</Label>
              <Textarea
                id="new-file-content"
                value={newFileContent}
                onChange={(event) => setNewFileContent(event.target.value)}
                rows={8}
                placeholder="Start typing…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewFileOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createTextFileMutation.mutate({ fileName: newFileName.trim(), content: newFileContent })
              }
              disabled={!newFileName.trim() || createTextFileMutation.isPending}
            >
              {createTextFileMutation.isPending ? "Creating…" : "Create file"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!versionsFor} onOpenChange={(open) => !open && setVersionsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>{versionsFor?.fileName}</DialogDescription>
          </DialogHeader>

          {versionsQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : versionsQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load version history.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(versionsQuery.data ?? []).map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">v{version.version}</Badge>
                    <span className="text-muted-foreground">{formatBytes(version.sizeBytes)}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(version.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadMutation.mutate(version.id)}
                    disabled={downloadMutation.isPending}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.fileName}&rdquo; (v{deleteTarget?.version}). This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteFolderTarget} onOpenChange={(open) => !open && setDeleteFolderTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder?</DialogTitle>
            <DialogDescription>
              {deleteFolderTarget && deleteFolderTarget.fileCount + deleteFolderTarget.folderCount > 0
                ? `"${deleteFolderTarget.name}" isn't empty. Move or delete its contents first.`
                : `This will permanently delete "${deleteFolderTarget?.name}". This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFolderTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteFolderTarget && deleteFolderMutation.mutate(deleteFolderTarget.id)}
              disabled={
                deleteFolderMutation.isPending ||
                (deleteFolderTarget ? deleteFolderTarget.fileCount + deleteFolderTarget.folderCount > 0 : false)
              }
            >
              {deleteFolderMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
