const BASE_URL = '/api/admin';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'omit',
    ...options
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || res.statusText);
  }

  if (!text || text.trim() === '') {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}

async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'omit'
    // Do not set Content-Type – browser sets multipart/form-data with boundary
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  if (!text || text.trim() === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON response');
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  postFormData: <T>(path: string, formData: FormData) => requestFormData<T>(path, formData),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' })
};

