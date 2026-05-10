import { useCallback, useRef, useState } from 'react';
import { extractTextLines } from '../utils/pdfText.js';
import { parseSignupRef } from '../utils/parseSignup.js';
import { parseBlockReport } from '../utils/parseBlocks.js';

const SIGNUP_HINT_RE = /signup|reference|sat|sun|weekday|mon.?fri/i;
const BLOCK_HINT_RE = /block/i;

function classifyFile(name) {
  if (BLOCK_HINT_RE.test(name)) return 'block';
  if (SIGNUP_HINT_RE.test(name)) return 'signup';
  return 'unknown';
}

export default function FileUploader({ onParsed, busy, setBusy }) {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [errors, setErrors] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    async (fileList) => {
      const files = [...fileList].filter((f) =>
        f.name.toLowerCase().endsWith('.pdf'),
      );
      if (!files.length) return;

      setBusy(true);
      setErrors([]);
      const signups = [];
      const blockReports = [];
      const newErrors = [];

      for (const file of files) {
        const kind = classifyFile(file.name);
        try {
          setProgress({ file: file.name, page: 0, total: 0 });
          const lines = await extractTextLines(file, (p) =>
            setProgress({ file: file.name, ...p }),
          );

          if (kind === 'block' || (kind === 'unknown' && /block/i.test(lines.slice(0, 5).join(' ')))) {
            const parsed = parseBlockReport(lines, file.name);
            blockReports.push({ ...parsed, file_name: file.name });
          } else {
            const parsed = parseSignupRef(lines, file.name);
            signups.push({ ...parsed, file_name: file.name });
          }
        } catch (err) {
          console.error(err);
          newErrors.push(`${file.name}: ${err.message ?? err}`);
        }
      }

      setProgress(null);
      setBusy(false);
      setErrors(newErrors);
      onParsed({ signups, blockReports });
    },
    [onParsed, setBusy],
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <section
      aria-label="Upload schedule PDFs"
      className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
    >
      <h2 className="text-2xl font-semibold text-slate-900 mb-1">
        Upload your schedule PDFs
      </h2>
      <p className="text-slate-600 mb-4 text-base">
        Drop in any number of <strong>Signup Reference</strong> and{' '}
        <strong>Block Report</strong> PDFs. Everything is processed right in
        your browser — nothing leaves your device.
      </p>

      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition ${
          dragOver
            ? 'border-blue-600 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
        } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <p className="text-xl font-medium text-slate-800">
          {busy ? 'Reading PDFs…' : 'Click or drop PDFs here'}
        </p>
        <p className="text-base text-slate-600 mt-1">
          Accepts multiple files at once.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {progress && (
        <p className="mt-3 text-base text-slate-700" aria-live="polite">
          Reading <code className="px-1 bg-slate-100 rounded">{progress.file}</code>{' '}
          {progress.total
            ? `(page ${progress.page} of ${progress.total})`
            : '(starting…)'}
        </p>
      )}

      {errors.length > 0 && (
        <ul className="mt-3 text-base text-rose-700 list-disc pl-6">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
