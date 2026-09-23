import type { AssignResult, Request, RequestState, Urgency } from '../types';
import { baseApi } from './baseApi';

export type RequestSortField = 'createdAt' | 'urgency' | 'state';

export interface ListRequestsParams {
  page?: number;
  pageSize?: number;
  state?: RequestState[];
  urgency?: Urgency[];
  sort?: RequestSortField;
  order?: 'asc' | 'desc';
}

export interface ListRequestsResponse {
  data: Request[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CreateRequestBody {
  patientName: string;
  address: string;
  latitude: number;
  longitude: number;
  urgency: Urgency;
  description?: string;
}

export const requestsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listRequests: builder.query<ListRequestsResponse, ListRequestsParams | void>({
      query: (params) => {
        const { state, urgency, ...rest } = params ?? {};
        return {
          url: '/api/requests',
          params: {
            ...rest,
            // Sent as comma lists (?state=REQUESTED,ASSIGNED); the server accepts that or repeated keys.
            ...(state?.length ? { state: state.join(',') } : {}),
            ...(urgency?.length ? { urgency: urgency.join(',') } : {}),
          },
        };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((request) => ({ type: 'Request' as const, id: request.id })),
              { type: 'Request' as const, id: 'LIST' },
            ]
          : [{ type: 'Request' as const, id: 'LIST' }],
    }),

    getRequest: builder.query<{ request: Request }, string>({
      query: (id) => `/api/requests/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Request', id }],
    }),

    createRequest: builder.mutation<{ request: Request }, CreateRequestBody>({
      query: (body) => ({ url: '/api/requests', method: 'POST', body }),
      invalidatesTags: [{ type: 'Request', id: 'LIST' }],
    }),

    assignRequest: builder.mutation<AssignResult, string>({
      query: (id) => ({ url: `/api/requests/${id}/assign`, method: 'POST' }),
      // Invalidated on failure too: a 409 means our list is stale, so refetch either way.
      invalidatesTags: (_result, _error, id) => [
        { type: 'Request', id },
        { type: 'Request', id: 'LIST' },
      ],
    }),
  }),
});

export const { useListRequestsQuery, useGetRequestQuery, useCreateRequestMutation, useAssignRequestMutation } =
  requestsApi;
