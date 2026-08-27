// Sanitize HTML to prevent XSS
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

export function sanitizeString(input: string | null | undefined): string {
  if (input === null || input === undefined) {
    return '';
  }
  return escapeHtml(String(input).trim());
}

export function validateAndSanitizeFullName(input: string | null | undefined): string {
  const sanitized = sanitizeString(input);
  if (sanitized.length === 0) {
    throw new Error('Full name is required');
  }
  if (sanitized.length > 100) {
    throw new Error('Full name must be 100 characters or less');
  }
  return sanitized;
}

export function validateAndSanitizeCity(input: string | null | undefined): string {
  const sanitized = sanitizeString(input);
  if (sanitized.length > 100) {
    throw new Error('City must be 100 characters or less');
  }
  return sanitized;
}

export function validateAndSanitizeDescription(input: string | null | undefined): string {
  const sanitized = sanitizeString(input);
  if (sanitized.length > 500) {
    throw new Error('Description must be 500 characters or less');
  }
  return sanitized;
}

export function validateAndSanitizeStoryContent(input: string | null | undefined): string {
  const sanitized = sanitizeString(input);
  if (sanitized.length > 2000) {
    throw new Error('Story content must be 2000 characters or less');
  }
  return sanitized;
}

// Format relative time
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

// Convert file to base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Keep the full data URL (e.g., "data:image/png;base64,...")
      resolve(result);
    };
    reader.onerror = (error) => reject(error);
  });
}

// Check file size
export function isFileSizeValid(file: File, maxBytes: number): boolean {
  return file.size <= maxBytes;
}

// Check file type
export function isFileTypeValid(file: File, allowedTypes: readonly string[]): boolean {
  return allowedTypes.includes(file.type);
}

// Truncate text
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
