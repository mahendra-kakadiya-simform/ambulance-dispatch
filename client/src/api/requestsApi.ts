import type { AssignResult, HistoryEntry, Request, RequestState, Urgency } from '../types';
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

export interface TransitionRequestBody {
  id: string;
  toState: RequestState;
  version: number; // the version the caller last saw — stale versions get a 409
  reason?: string;
}

export interface OverrideAssignmentBody {
  id: string;
  vehicleId: string;
  reason: string;
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
        { type: 'Vehicle', id: 'LIST' },
      ],
    }),

    getRequestHistory: builder.query<
      { data: HistoryEntry[]; meta: { page: number; pageSize: number; total: number; totalPages: number } },
      { id: string; page: number; pageSize?: number }
    >({
      query: ({ id, page, pageSize = 20 }) => ({ url: `/api/requests/${id}/history`, params: { page, pageSize } }),
      // Tagged with the request so any change to it (assign, override, transition) refreshes its history.
      providesTags: (_result, _error, { id }) => [{ type: 'Request', id }],
    }),

    // The authenticated driver's current request, or null.
    getMyRequest: builder.query<{ request: Request | null }, void>({
      query: () => '/api/drivers/me/request',
      providesTags: (result) => [
        { type: 'Request' as const, id: 'MINE' },
        ...(result?.request ? [{ type: 'Request' as const, id: result.request.id }] : []),
      ],
    }),

    transitionRequest: builder.mutation<{ request: Request }, TransitionRequestBody>({
      query: ({ id, ...body }) => ({ url: `/api/requests/${id}/state`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Request', id },
        { type: 'Request', id: 'LIST' },
        { type: 'Request', id: 'MINE' },
      ],
    }),

    overrideAssignment: builder.mutation<{ request: Request }, OverrideAssignmentBody>({
      query: ({ id, ...body }) => ({ url: `/api/requests/${id}/override`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Request', id },
        { type: 'Request', id: 'LIST' },
        { type: 'Vehicle', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useListRequestsQuery,
  useGetRequestQuery,
  useCreateRequestMutation,
  useAssignRequestMutation,
  useGetRequestHistoryQuery,
  useGetMyRequestQuery,
  useTransitionRequestMutation,
  useOverrideAssignmentMutation,
} = requestsApi;
