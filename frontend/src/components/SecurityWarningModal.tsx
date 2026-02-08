"use client";

import { createPortal } from "react-dom";

interface SecurityWarningModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SecurityWarningModal({
  isOpen,
  onConfirm,
  onCancel,
}: SecurityWarningModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop with cyberpunk grid */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onCancel}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,217,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(157,0,255,0.1)_1px,transparent_1px)] bg-[length:30px_30px]" />
        </div>
      </div>

      {/* Modal */}
      <div className="relative w-full max-w-lg my-8">
        {/* Modal content */}
        <div className="relative bg-gradient-to-b from-cyber-card-bg via-black to-cyber-dark-bg border border-gray-700/50">
          <div className="relative z-10 p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-cyber-blue/10 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl">⚠️</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-xl font-black uppercase tracking-wider text-cyber-blue">
                  Security Warning
                </h2>
                <div className="h-px w-full bg-gradient-to-r from-cyber-blue via-cyber-purple to-transparent mt-1.5" />
              </div>
            </div>

            {/* Content */}
            <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-7 max-h-[60vh] overflow-y-auto pr-1">
              <div className="p-3 sm:p-4 bg-cyber-purple/5 backdrop-blur-sm space-y-3 sm:space-y-4">
                <div>
                  <p className="text-xs sm:text-sm font-bold text-cyber-purple-light mb-2 font-mono uppercase tracking-wide">
                    Critical: Spending Key Exposure
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-300 font-mono leading-relaxed">
                    The Spending Key is equivalent to your{" "}
                    <span className="text-cyber-blue-glow font-bold">
                      Octopus private key
                    </span>
                    .
                  </p>
                </div>

                <div className="pt-2 sm:pt-3 border-t border-cyber-purple/20">
                  <p className="text-[10px] sm:text-xs font-bold text-cyber-purple-light mb-2 sm:mb-3 font-mono uppercase">
                    ⚠ Anyone with this key can
                  </p>
                  <div className="space-y-1.5 sm:space-y-2 text-[10px] sm:text-xs text-gray-300 font-mono">
                    <p className="flex items-start gap-2">
                      <span className="text-cyber-blue flex-shrink-0">•</span>
                      <span>
                        Spend <span className="text-cyber-blue">all</span> your
                        shielded funds
                      </span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-cyber-blue flex-shrink-0">•</span>
                      <span>
                        View <span className="text-cyber-blue">all</span> your
                        private transactions
                      </span>
                    </p>
                    <p className="flex items-start gap-2">
                      <span className="text-cyber-blue flex-shrink-0">•</span>
                      <span>
                        <span className="text-cyber-blue">Impersonate</span> you in
                        the Octopus protocol
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-2 sm:p-3 bg-cyber-blue/[0.03]">
                <p className="text-[9px] sm:text-[10.5px] text-yellow-400 font-mono tracking-wide">
                  Only reveal this key if you understand the risks
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={onCancel}
                className="flex-1 btn-secondary text-xs py-2.5 sm:py-3"
              >
                ← CANCEL
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 border-2 border-red-500/60 bg-transparent text-red-500 hover:border-red-500 hover:bg-red-500/5 hover:shadow-lg hover:shadow-red-500/30 px-4 sm:px-6 py-2.5 sm:py-3 text-xs font-bold tracking-wider uppercase transition-all duration-300 relative group"
              >
                <span className="relative z-10">I UNDERSTAND →</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
