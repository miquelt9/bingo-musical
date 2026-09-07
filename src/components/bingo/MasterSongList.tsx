import React from "react";
import { Track } from "../../types/deck";

interface MasterSongListProps {
  eventTitle: string;
  tracks: Track[];
  shareUrl?: string | null;
  qrDataUrl?: string | null;
}

export const MasterSongList: React.FC<MasterSongListProps> = ({
  eventTitle,
  tracks,
  shareUrl = null,
  qrDataUrl = null,
}) => {
  return (
    <div className="bg-white text-zinc-900 p-6 sm:p-8 border border-zinc-200 max-w-3xl mx-auto print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full">
      <div className="text-center mb-5 print:mb-4">
        <h2 className="text-2xl font-black tracking-tight text-zinc-950 uppercase print:text-xl">
          {eventTitle}
        </h2>
        <p className="text-sm text-zinc-500 font-medium mt-1">
          Master song list · numbers match deck order
        </p>
      </div>

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-zinc-900">
            <th className="py-2 pr-3 text-xs font-black uppercase tracking-wide w-14">#</th>
            <th className="py-2 pr-3 text-xs font-black uppercase tracking-wide">Song</th>
            <th className="py-2 text-xs font-black uppercase tracking-wide">Artist</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, index) => (
            <tr key={track.id} className="border-b border-zinc-200">
              <td className="py-2 pr-3 align-top font-black tabular-nums text-base text-zinc-950">
                {index + 1}
              </td>
              <td className="py-2 pr-3 align-top text-sm font-semibold text-zinc-900">
                {track.title}
              </td>
              <td className="py-2 align-top text-sm text-zinc-600">{track.artist}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(shareUrl || qrDataUrl) && (
        <div className="mt-6 pt-4 border-t border-zinc-200 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-bold text-zinc-800">Get this deck online</p>
            {shareUrl && (
              <p className="break-all text-[10px] text-zinc-500 leading-snug">{shareUrl}</p>
            )}
          </div>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="QR code linking to this deck"
              className="w-20 h-20 shrink-0"
            />
          )}
        </div>
      )}
    </div>
  );
};
