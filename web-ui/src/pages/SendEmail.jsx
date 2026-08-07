import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ComposerForm from "../components/ComposerForm";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { authFetch, clearSession } from "../api/client";
import "./SendEmail.css";

/**
 * Sends emails in either mode.
 * `mode`: 'separate' → POST /emails/separate; 'consolidated' → POST /emails/consolidated.
 */
function SendEmail({ mode }) {
  const navigate = useNavigate();
  const isSeparate = mode === "separate";
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingForm, setPendingForm] = useState(null);

  const closeToast = () => setToast(null);

  const handleSubmit = (formData) => {
    setPendingForm(formData);
    setConfirmOpen(true);
  };

  const confirmSend = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const endpoint = isSeparate ? "/emails/separate" : "/emails/consolidated";
      const data = await authFetch(endpoint, {
        method: "POST",
        body: pendingForm,
      });

      const count = isSeparate
        ? data?.total ?? 0
        : pendingForm.getAll("to").length;

      setToast({
        type: "success",
        message: isSeparate
          ? `${data?.sent ?? count} of ${
              data?.total ?? count
            } separate emails sent successfully.`
          : "Consolidated email sent successfully.",
      });

      setTimeout(() => navigate("/dashboard"), 1400);
    } catch (err) {
      if (err.status === 401) {
        clearSession();
        navigate("/", { replace: true });
        return;
      }
      setToast({
        type: "error",
        message: err.message || "Failed to send email.",
      });
    } finally {
      setSubmitting(false);
      setPendingForm(null);
    }
  };

  return (
    <div className="mp-send">
      <ComposerForm
        mode={mode}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <Modal
        open={confirmOpen}
        title={
          isSeparate ? "Confirm separate send" : "Confirm consolidated send"
        }
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="mp-modal__btn mp-modal__btn--ghost"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="mp-modal__btn mp-modal__btn--primary"
              onClick={confirmSend}
            >
              {isSeparate ? "Send individually" : "Send email"}
            </button>
          </>
        }
      >
        <p>
          {isSeparate
            ? `This will send an individual email to each of the ${
                pendingForm?.getAll("to").length || 0
              } recipient(s). This cannot be undone.`
            : `This will send one email to ${
                pendingForm?.getAll("to").length || 0
              } recipient(s) in the To field. This cannot be undone.`}
        </p>
      </Modal>

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}

export default SendEmail;
