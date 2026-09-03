'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Upload, Link as LinkIcon, Image as ImageIcon, Loader2, Check, X } from 'lucide-react';

interface ImageInputPickerProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  bucket?: string;
}

export function ImageInputPicker({
  value,
  onChange,
  label = 'Imagen (URL o Archivo local)',
  placeholder = 'https://ejemplo.com/imagen.jpg',
  bucket = 'products',
}: ImageInputPickerProps) {
  const [mode, setMode] = useState<'url' | 'upload'>('url');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<{ blob: Blob; base64: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ blob: file, base64: event.target?.result as string });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const mimeType = 'image/jpeg';
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const base64 = canvas.toDataURL(mimeType, quality);
                resolve({ blob, base64 });
              } else {
                resolve({ blob: file, base64: event.target?.result as string });
              }
            },
            mimeType,
            quality
          );
        };
        img.onerror = () => resolve({ blob: file, base64: event.target?.result as string });
      };
      reader.onerror = () => resolve({ blob: file, base64: '' });
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);

    try {
      // Comprimir imagen para optimizar carga y peso en base de datos
      const { blob: compressedBlob, base64: compressedBase64 } = await compressImage(file);
      let uploadedUrl: string | null = null;

      try {
        const formData = new FormData();
        const compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
          type: 'image/jpeg',
        });
        formData.append('file', compressedFile);
        formData.append('bucket', bucket);

        const res = await fetch('/api/storage/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.url) uploadedUrl = json.url;
        }
      } catch {
        // Fallback local
      }

      // Si falla la API de storage, usar la versión comprimida en Base64
      if (!uploadedUrl) {
        uploadedUrl = compressedBase64;
      }

      if (uploadedUrl) {
        onChange(uploadedUrl);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error al procesar la imagen.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
          {label}
        </label>
        <div className="flex items-center gap-1 bg-[var(--bg-input)] p-0.5 rounded-lg border text-[10px] font-bold" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
              mode === 'url' ? 'bg-[var(--orange)] text-white font-black' : 'text-[var(--text-muted)]'
            }`}
          >
            <LinkIcon className="w-3 h-3" /> URL
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-2 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
              mode === 'upload' ? 'bg-[var(--orange)] text-white font-black' : 'text-[var(--text-muted)]'
            }`}
          >
            <Upload className="w-3 h-3" /> Subir Archivo
          </button>
        </div>
      </div>

      {mode === 'url' ? (
        <div className="relative">
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-xs font-semibold px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--orange-soft)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed rounded-xl p-4 text-center hover:border-[var(--orange)] transition-all cursor-pointer flex flex-col items-center justify-center gap-2"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-[var(--orange)]" />
                <span className="text-xs font-black text-[var(--orange)]">Subiendo imagen desde dispositivo...</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-[var(--orange)]" />
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  {value ? 'Toca para cambiar la imagen del dispositivo' : 'Toca para seleccionar foto/imagen de tu dispositivo'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">Formatos: JPG, PNG, WEBP, SVG</span>
              </>
            )}
          </button>
        </div>
      )}

      {uploadError && (
        <p className="text-[10px] font-bold text-rose-500">{uploadError}</p>
      )}

      {/* Previsualización de la Imagen */}
      {value && (
        <div className="flex items-center gap-3 p-2 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <img
            src={value}
            alt="Previsualización"
            className="w-10 h-10 rounded-lg object-cover border shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/file.svg';
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black text-emerald-500 flex items-center gap-1">
              <Check className="w-3 h-3" /> Imagen seleccionada
            </p>
            <p className="text-[10px] font-bold text-[var(--text-muted)] truncate">{value}</p>
          </div>
        </div>
      )}
    </div>
  );
}
