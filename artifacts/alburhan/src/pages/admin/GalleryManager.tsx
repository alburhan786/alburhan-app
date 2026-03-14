import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface GalleryImage {
  id: string;
  title: string | null;
  fileName: string;
  fileUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export default function GalleryManager() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gallery`, { credentials: "include" });
      if (res.ok) setImages(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      const res = await fetch(`${API_BASE}/api/gallery/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast({ title: "Image uploaded successfully" });
      fetchImages();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleActive = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/gallery/${id}/toggle`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Toggle failed");
      fetchImages();
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const deleteImage = async (id: string) => {
    if (!confirm("Delete this image?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/gallery/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Image deleted" });
      fetchImages();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Image Gallery</h1>
          <p className="text-muted-foreground mt-1">Manage homepage gallery and banner images.</p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl"
          >
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload Image
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground animate-pulse">Loading gallery...</div>
      ) : images.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2">
          <Upload className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No images yet</h3>
          <p className="text-muted-foreground text-sm mb-4">Upload images to display on the homepage gallery.</p>
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="rounded-xl">
            <Upload className="w-4 h-4 mr-2" /> Upload First Image
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map((img) => (
            <Card key={img.id} className={`overflow-hidden rounded-2xl border-none shadow-sm ${!img.isActive ? 'opacity-60' : ''}`}>
              <div className="relative aspect-[4/3] bg-muted">
                <img
                  src={`${API_BASE}${img.fileUrl}`}
                  alt={img.title || img.fileName}
                  className="w-full h-full object-cover"
                />
                {!img.isActive && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="bg-black/60 text-white px-3 py-1 rounded-full text-xs font-medium">Hidden</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-sm font-medium truncate mb-3">{img.title || img.fileName}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-lg text-xs"
                    onClick={() => toggleActive(img.id)}
                  >
                    {img.isActive ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    {img.isActive ? "Hide" : "Show"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => deleteImage(img.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
