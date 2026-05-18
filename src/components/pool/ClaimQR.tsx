/**
 * ClaimQR — renders a QR code for a teleport claim URL.
 *
 * Used in two places:
 *  - CommitForm result panel (right after a successful commit, so the
 *    depositor can hand a phone to the recipient and have them scan)
 *  - Notebook entry's expandable "Claim URL" section (for re-sharing
 *    a pending commit)
 *
 * Design: light-on-dark for readability AND scanner-friendliness — the
 * QR itself is white background + black foreground (max contrast for
 * camera-based decoding), framed by a subtle dark card so it doesn't
 * fight the surrounding UI.
 *
 * Defaults to 180x180 px which is large enough for a phone camera at
 * arm's length but doesn't dominate the form.
 */

import { QRCodeSVG } from "qrcode.react";

interface ClaimQRProps {
  value: string;
  size?: number;
  className?: string;
}

export const ClaimQR = ({ value, size = 180, className = "" }: ClaimQRProps) => {
  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <div className="rounded-md bg-white p-3 shadow-sm">
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>
      <p className="text-xs text-muted-foreground">Scan with the recipient's phone</p>
    </div>
  );
};
