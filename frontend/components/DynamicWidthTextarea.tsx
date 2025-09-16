// components/DynamicWidthTextarea.tsx

import React, { useState, useRef, useLayoutEffect, useCallback } from "react";

interface DynamicWidthTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value?: string;
  placeholder?: string;
  growVertically?: boolean;
  maxRows?: number;
  ref?: React.Ref<HTMLTextAreaElement>;
}

const DynamicWidthTextarea: React.FC<DynamicWidthTextareaProps> = ({
  value: defaultValue = "",
  placeholder = "",
  onChange,
  growVertically = false,
  ...props
}) => {
  const [value, setValue] = useState(String(defaultValue));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    if (!props.rows && growVertically && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [growVertically, props.rows]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    onChange?.(e);
    adjustHeight();
  };

  useLayoutEffect(() => {
    setValue(String(defaultValue));
  }, [defaultValue]);

  useLayoutEffect(() => {
    adjustHeight();
  }, [adjustHeight, value]);

  return (
    <div className={`container${growVertically ? " vertical" : ""}`}>
      <textarea
        {...props}
        ref={textareaRef}
        rows={props.rows || 1}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        className="textarea"
        style={
          growVertically
            ? {
                width: "100%",
                overflow: props.rows ? "auto" : "hidden",
                resize: "none",
              }
            : undefined
        }
      />
      {!growVertically && (
        <div
          className="sizer"
          style={{
            whiteSpace: growVertically ? "pre-wrap" : "pre",
          }}
        >
          {value || placeholder}{" "}
        </div>
      )}
      <style jsx>{`
        .container {
          display: inline-block;
          position: relative;
          min-width: 1px;
        }
        .container.vertical {
          display: block;
          width: 100%;
        }
        .textarea,
        .sizer {
          font: inherit;
          padding: inherit;
          border: inherit;
          /* white-space: pre; */
          background: inherit;
        }
        .sizer {
          visibility: hidden;
          display: inline-block;
        }
        .textarea {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          resize: none;
          overflow: hidden;
          box-sizing: border-box;
          border-radius: 4px;
          background-color: transparent;
          color: #000;
        }
        .textarea:enabled {
          background-color: rgba(0, 0, 0, 0.03);
        }
        .textarea:disabled {
          color: #000;
        }
        .textarea:focus {
          outline: none;
          border: 1px solid rgba(0, 0, 0, 0.1) !important;
        }
        .container.vertical .textarea {
          position: static;
        }
      `}</style>
    </div>
  );
};

export default DynamicWidthTextarea;
