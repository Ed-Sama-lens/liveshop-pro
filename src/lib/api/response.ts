export interface PaginationMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly meta?: PaginationMeta;
}

export function ok<T>(data: T): ApiResponse<T> {
  return Object.freeze({ success: true, data });
}

export function error(message: string): ApiResponse<never> {
  return Object.freeze({ success: false, error: message });
}

export function paginated<T>(
  data: T,
  pagination: { total: number; page: number; limit: number }
): ApiResponse<T> {
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  return Object.freeze({
    success: true,
    data,
    meta: Object.freeze({
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
    }),
  });
}
