import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Camera, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

type Props = {
  file: File | null;
  onCancel: () => void;
  /** Called with all accepted pages (in order) when the teacher is done. */
  onConfirm: (pages: File[]) => void;
};

const MAX_PAGES = 8;
const MAX_DIMENSION = 1600; // long edge px — keeps decoded bitmaps small on phones

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });

const canvasToFile = (canvas: HTMLCanvasElement, name: string, mime: string): Promise<File> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(new File([b], name, { type: mime })) : reject(new Error("encode failed"))),
      mime,
      0.82,
    );
  });

/** Downscale a file so its long edge is at most MAX_DIMENSION, re-encoded as JPEG. */
const normalizeImage = async (file: File, label: string): Promise<File> => {
  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no ctx");
  ctx.drawImage(img, 0, 0, w, h);
  return canvasToFile(canvas, `${label}.jpg`, "image/jpeg");
};

/** Crop using natural pixel coordinates (computed from the displayed image) and downscale. */
const cropAndNormalize = async (
  img: HTMLImageElement,
  crop: PixelCrop,
  label: string,
): Promise<File> => {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const sx = crop.x * scaleX;
  const sy = crop.y * scaleY;
  const sw = crop.width * scaleX;
  const sh = crop.height * scaleY;
  const longest = Math.max(sw, sh);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no ctx");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvasToFile(canvas, `${label}.jpg`, "image/jpeg");
};

/** Memoized blob URL that revokes itself when the file changes or unmounts. */
const useObjectUrl = (file: File | null | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
};

function PageThumb({ file, idx, onRemove }: { file: File; idx: number; onRemove: () => void }) {
  const url = useObjectUrl(file);
  return (
    <div className="relative shrink-0">
      {url && (
        <img
          src={url}
          alt={`Page ${idx + 1}`}
          className="h-20 w-20 object-cover rounded border border-border"
        />
      )}
      <span className="absolute top-0 left-0 bg-background/80 text-xs px-1 rounded-br">{idx + 1}</span>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
        aria-label="Remove page"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function ImageCropDialog({ file, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  const [completed, setCompleted] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<File[]>([]);
  const [current, setCurrent] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Sync incoming `file` prop -> internal "current" once when it becomes non-null.
  useEffect(() => {
    if (file) {
      setCurrent(file);
      setOpen(true);
      setCompleted(null);
      setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
    }
  }, [file]);

  const currentUrl = useObjectUrl(current);

  const resetAll = useCallback(() => {
    setPages([]);
    setCurrent(null);
    setCompleted(null);
    setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next) return;
    if (busy) return;
    setOpen(false);
    resetAll();
    onCancel();
  };

  const cancel = () => handleOpenChange(false);

  const addCropped = async () => {
    if (!current || !imgRef.current || !completed || completed.width < 5 || completed.height < 5) return;
    setBusy(true);
    try {
      const label = `p${pages.length + 1}-cropped`;
      const cropped = await cropAndNormalize(imgRef.current, completed, label);
      setPages((p) => [...p, cropped]);
      setCurrent(null);
      setCompleted(null);
      setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not crop image");
    } finally {
      setBusy(false);
    }
  };

  const addFull = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const label = `p${pages.length + 1}-full`;
      const normalized = await normalizeImage(current, label);
      setPages((p) => [...p, normalized]);
      setCurrent(null);
      setCompleted(null);
      setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read image");
    } finally {
      setBusy(false);
    }
  };

  const removePage = (idx: number) => setPages((p) => p.filter((_, i) => i !== idx));

  const pickFile = (kind: "camera" | "upload") => {
    if (busy) return;
    if (pages.length >= MAX_PAGES) {
      toast.error(`Maximum ${MAX_PAGES} pages per comment`);
      return;
    }
    const el = kind === "camera" ? cameraInputRef.current : uploadInputRef.current;
    el?.click();
  };

  const finish = () => {
    const all = pages;
    if (all.length === 0) return;
    setOpen(false);
    const out = [...all];
    resetAll();
    onConfirm(out);
  };

  const title = useMemo(() => {
    if (current) return pages.length === 0 ? "Crop your photo" : `Page ${pages.length + 1} — crop or use full image`;
    return `${pages.length} page${pages.length === 1 ? "" : "s"} added`;
  }, [current, pages.length]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {current
              ? "Drag to crop, or use the full image. You can add more pages after this one for comments that span multiple book pages."
              : "Add another photo to continue the same comment, or transcribe what you have."}
          </DialogDescription>
        </DialogHeader>

        {pages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {pages.map((p, idx) => (
              <PageThumb key={`${p.name}-${idx}`} file={p} idx={idx} onRemove={() => removePage(idx)} />
            ))}
          </div>
        )}

        {current && currentUrl && (
          <div className="w-full max-h-[55vh] overflow-auto bg-muted rounded-md flex items-center justify-center">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompleted(c)}
              keepSelection
            >
              <img
                ref={imgRef}
                src={currentUrl}
                alt="To crop"
                style={{ maxHeight: "55vh", maxWidth: "100%" }}
              />
            </ReactCrop>
          </div>
        )}

        {!current && pages.length > 0 && pages.length < MAX_PAGES && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => pickFile("camera")} disabled={busy}>
              <Camera className="w-4 h-4 mr-1.5" />Take another photo
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => pickFile("upload")} disabled={busy}>
              <ImageIcon className="w-4 h-4 mr-1.5" />Upload another
            </Button>
          </div>
        )}

        {pages.length >= MAX_PAGES && !current && (
          <p className="text-sm text-muted-foreground">Maximum {MAX_PAGES} pages reached.</p>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setCurrent(f);
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setCurrent(f);
          }}
        />

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
          {current && (
            <>
              <Button variant="outline" onClick={addFull} disabled={busy}>
                <Plus className="w-4 h-4 mr-1.5" />Add full image
              </Button>
              <Button onClick={addCropped} disabled={busy || !completed}>
                <Plus className="w-4 h-4 mr-1.5" />Add cropped image
              </Button>
            </>
          )}
          {pages.length > 0 && !current && (
            <Button onClick={finish} disabled={busy}>
              Transcribe {pages.length} page{pages.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
