import React from 'react';
import { X } from 'lucide-react';

export default function LightboxModal({ image, onClose }) {
  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full bg-[#161d26] border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-[#0f1419]/90 border border-slate-700 text-slate-200 hover:text-amber-400"
          aria-label="Close panel preview"
        >
          <X className="w-5 h-5" />
        </button>

        <img
          src={image.signedUrl || image.url}
          alt={image.brief || 'Graphic novel panel'}
          className="w-full max-h-[75vh] object-contain bg-[#0f1419]"
        />

        {image.brief && (
          <div className="p-4 border-t border-slate-800 text-xs font-mono text-slate-300">
            {image.brief}
          </div>
        )}
      </div>
    </div>
  );
}
