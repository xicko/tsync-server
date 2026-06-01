export interface ReqQuery {
  page?: number;
  limit?: number;
}

export class PaginationResponse {
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}
