/**
 * SessionWarningModal - Shows a warning when user is about to be logged out due to inactivity
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock } from 'lucide-react';

interface SessionWarningModalProps {
  show: boolean;
  remainingTime: string;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export function SessionWarningModal({
  show,
  remainingTime,
  onStayLoggedIn,
  onLogout,
}: SessionWarningModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={onStayLoggedIn}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-full max-w-md"
          >
            <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl p-6 mx-4">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-xl font-semibold text-center text-gray-900 dark:text-white mb-2">
                Session Expiring Soon
              </h2>

              {/* Message */}
              <p className="text-center text-gray-600 dark:text-gray-300 mb-4">
                You will be automatically logged out due to inactivity.
              </p>

              {/* Timer */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <span className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400">
                  {remainingTime}
                </span>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onLogout}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
                >
                  Log Out
                </button>
                <button
                  onClick={onStayLoggedIn}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Stay Logged In
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default SessionWarningModal;
