import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

type Props = {
  file: File | null;
  onCancel: () => void;
  /** Returns one accepted image. Array shape is kept for existing callers. */
  onConfirm: (pages: File[]) => void;
};

const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 0.78;

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

const canvasToFile = (canvas: HTMLCanvasElement, name: string): Promise<File> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("encode failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });

const normalizeImage = async (file: File, label: string): Promise<File> => {
  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToFile(canvas, `${label}.jpg`);
};

const cropAndNormalize = async (img: HTMLImageElement, crop: PixelCrop, label: string): Promise<File> => {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const sourceX = crop.x * scaleX;
  const sourceY = crop.y * scaleY;
  const sourceWidth = crop.width * scaleX;
  const sourceHeight = crop.height * scaleY;
  const longest = Math.max(sourceWidth, sourceHeight);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process crop");
  ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  return canvasToFile(canvas, `${label}.jpg`);
};

const useObjectUrl = (file: File | null): string | null => {
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

export default function ImageCropDialog({ file, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  const [completed, setCompleted] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const currentUrl = useObjectUrl(current);

  useEffect(() => {
    if (!file) return;
    setCurrent(file);
    setOpen(true);
    setCompleted(null);
    setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  }, [file]);

  const reset = useCallback(() => {
    setCurrent(null);
    setCompleted(null);
    setCrop({ unit: "%", x: 5, y: 5, width: 90, height: 90 });
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next || busy) return;
    setOpen(false);
    reset();
    onCancel();
  };

  const confirmImage = async (kind: "full" | "cropped") => {
    if (!current) return;
    if (kind === "cropped" && (!imgRef.current || !completed || completed.width < 5 || completed.height < 5)) return;
    setBusy(true);
    try {
      const label = `handwriting-${Date.now()}-${kind}`;
      const output = kind === "full"
        ? await normalizeImage(current, label)
        : await cropAndNormalize(imgRef.current!, completed!, label);
      setOpen(false);
      reset();
      onConfirm([output]);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not process image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>
            Use the full image or crop to the handwritten comment. This photo will be transcribed before you add another page.
          </DialogDescription>
        </DialogHeader>

        {current && currentUrl && (
          <div className="w-full max-h-[55vh] overflow-auto bg-muted rounded-md flex items-center justify-center">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(nextCrop) => setCompleted(nextCrop)}
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

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => confirmImage("full")} disabled={busy || !current}>
            <ImageIcon className="w-4 h-4 mr-1.5" />Use full image
          </Button>
          <Button onClick={() => confirmImage("cropped")} disabled={busy || !completed}>
            <Check className="w-4 h-4 mr-1.5" />Use cropped image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
