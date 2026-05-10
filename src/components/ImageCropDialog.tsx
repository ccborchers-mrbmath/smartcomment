import { useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  file: File | null;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
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
  const imgRef = useRef<HTMLImageElement | null>(null);

  const url = file ? URL.createObjectURL(file) : null;

  const confirm = async () => {
    if (!file || !imgRef.current || !completed || completed.width < 5 || completed.height < 5) return;
    setBusy(true);
    try {
      const mime = file.type || "image/jpeg";
      const blob = await cropToBlob(imgRef.current, completed, mime);
      const ext = mime.split("/")[1] ?? "jpg";
      const cropped = new File([blob], file.name.replace(/\.[^.]+$/, "") + `-cropped.${ext}`, { type: mime });
      onConfirm(cropped);
    } finally {
      setBusy(false);
    }
  };

  const useFull = () => {
    if (file) onConfirm(file);
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>
            Drag the edges or corners to crop out anything you don't want included. Sides can be adjusted independently.
          </DialogDescription>
        </DialogHeader>
        <div className="w-full max-h-[65vh] overflow-auto bg-muted rounded-md flex items-center justify-center">
          {url && (
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
                style={{ maxHeight: "65vh", maxWidth: "100%" }}
              />
            </ReactCrop>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={useFull} disabled={busy}>Use full image</Button>
          <Button onClick={confirm} disabled={busy || !completed}>Use cropped image</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
