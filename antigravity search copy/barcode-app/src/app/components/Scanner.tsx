"use client";

import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { X } from "lucide-react";

interface ScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
  onClose: () => void;
}

export default function Scanner({
  onScanSuccess,
  onScanFailure,
  onClose,
}: ScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((error) => {
          console.error("Failed to clear html5-qrcode scanner. ", error);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const scannerId = "reader";
    
    // Ensure the element exists before initializing
    if (!document.getElementById(scannerId)) return;

    if (!scannerRef.current) {
        const scanner = new Html5QrcodeScanner(
            scannerId,
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        scannerRef.current = scanner;
    
        scanner.render(
            (decodedText) => {
                onScanSuccess(decodedText);
                scanner.clear();
            },
            (error) => {
                if (onScanFailure) onScanFailure(error);
            }
        );
    }

    return () => {
        // Cleanup handled in the mount effect or by the library
    };
  }, [isMounted, onScanSuccess, onScanFailure]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Scan Barcode
        </h2>
        <div id="reader" className="overflow-hidden rounded-lg"></div>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Point your camera at a food barcode
        </p>
      </div>
    </div>
  );
}
