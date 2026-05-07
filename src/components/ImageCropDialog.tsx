import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type Props = {
  file: File | null;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
};

const getCroppedBlob = (imageSrc: string, area: Area, mime: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = area.width;
      canvas.height = area.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob fail"))), mime, 0.92);
    };
    img.onerror = reject;
    img.src = imageSrc;
  });

export default function ImageCropDialog({ file, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const url = file ? URL.createObjectURL(file) : null;

  const onComplete = useCallback((_: Area, pixels: Area) => setAreaPx(pixels), []);

  const confirm = async () => {
    if (!file || !url || !areaPx) return;
    setBusy(true);
    try {
      const mime = file.type || "image/jpeg";
      const blob = await getCroppedBlob(url, areaPx, mime);
      const ext = mime.split("/")[1] ?? "jpg";
      const cropped = new File([blob], file.name.replace(/\.[^.]+$/, "") + `-cropped.${ext}`, { type: mime });
      onConfirm(cropped);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop your note</DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-[60vh] bg-muted rounded-md overflow-hidden">
          {url && (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              aspect={undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onComplete}
              restrictPosition={false}
            />
          )}
        </div>
        <div className="px-1">
          <label className="text-xs text-muted-foreground">Zoom</label>
          <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || !areaPx}>Use cropped image</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
