import { useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Camera, Image as ImageIcon } from "lucide-react";

type Props = {
  file: File | null;
  onCancel: () => void;
  /** Called with all accepted pages (in order) when the teacher is done. */
  onConfirm: (pages: File[]) => void;
};

const cropToBlob = (img: HTMLImageElement, crop: PixelCrop, mime: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.width * scaleX);
    canvas.height = Math.round(crop.height * scaleY);
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("no ctx"));
    ctx.drawImage(
      img,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob fail"))), mime, 0.92);
  });

export default function ImageCropDialog({ file, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  const [completed, setCompleted] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<File[]>([]);
  const [current, setCurrent] = useState<File | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Sync the incoming prop into local "current" state once per open.
  if (file && !current && pages.length === 0) {
    setCurrent(file);
  }

  const reset = () => {
    setPages([]);
    setCurrent(null);
    setCompleted(null);
    setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  };

  const cancel = () => {
    reset();
    onCancel();
  };

  const addCropped = async () => {
    if (!current || !imgRef.current || !completed || completed.width < 5 || completed.height < 5) return;
    setBusy(true);
    try {
      const mime = current.type || "image/jpeg";
      const blob = await cropToBlob(imgRef.current, completed, mime);
      const ext = mime.split("/")[1] ?? "jpg";
      const cropped = new File([blob], current.name.replace(/\.[^.]+$/, "") + `-p${pages.length + 1}-cropped.${ext}`, { type: mime });
      setPages((p) => [...p, cropped]);
      setCurrent(null);
      setCompleted(null);
      setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
    } finally {
      setBusy(false);
    }
  };

  const addFull = () => {
    if (!current) return;
    setPages((p) => [...p, current]);
    setCurrent(null);
    setCompleted(null);
    setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  };

  const removePage = (idx: number) => {
    setPages((p) => p.filter((_, i) => i !== idx));
  };

  const finish = () => {
    const all = [...pages, ...(current ? [current] : [])];
    if (all.length === 0) return;
    onConfirm(all);
    reset();
  };

  const url = current ? URL.createObjectURL(current) : null;

  return (
    <Dialog open={!!file || pages.length > 0 || !!current} onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {current
              ? pages.length === 0
                ? "Crop your photo"
                : `Page ${pages.length + 1} — crop or use full image`
              : `${pages.length} page${pages.length === 1 ? "" : "s"} added`}
          </DialogTitle>
          <DialogDescription>
            {current
              ? "Drag the edges or corners to crop, or use the full image. You can add more pages after this one for comments that span multiple book pages."
              : "Add another photo to continue the same comment, or transcribe what you have."}
          </DialogDescription>
        </DialogHeader>

        {pages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {pages.map((p, idx) => (
              <div key={idx} className="relative shrink-0">
                <img
                  src={URL.createObjectURL(p)}
                  alt={`Page ${idx + 1}`}
                  className="h-20 w-20 object-cover rounded border border-border"
                />
                <span className="absolute top-0 left-0 bg-background/80 text-xs px-1 rounded-br">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removePage(idx)}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  aria-label="Remove page"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {current && url && (
          <div className="w-full max-h-[55vh] overflow-auto bg-muted rounded-md flex items-center justify-center">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompleted(c)}
              keepSelection
            >
              <img
                ref={imgRef}
                src={url}
                alt="To crop"
                style={{ maxHeight: "55vh", maxWidth: "100%" }}
              />
            </ReactCrop>
          </div>
        )}

        {!current && pages.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="w-4 h-4 mr-1.5" />Take another photo
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => uploadInputRef.current?.click()}
            >
              <ImageIcon className="w-4 h-4 mr-1.5" />Upload another
            </Button>
          </div>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setCurrent(f);
            e.target.value = "";
          }}
        />
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setCurrent(f);
            e.target.value = "";
          }}
        />

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
          {current ? (
            <>
              <Button variant="outline" onClick={addFull} disabled={busy}>
                <Plus className="w-4 h-4 mr-1.5" />Add full image
              </Button>
              <Button onClick={addCropped} disabled={busy || !completed}>
                <Plus className="w-4 h-4 mr-1.5" />Add cropped image
              </Button>
            </>
          ) : null}
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
