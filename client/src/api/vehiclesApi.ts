import type { LivePosition, Vehicle, VehiclePosition, VehicleStatus } from '../types';
import { baseApi } from './baseApi';

export interface ListVehiclesParams {
  page?: number;
  pageSize?: number;
  status?: VehicleStatus;
}

export interface ListVehiclesResponse {
  data: Vehicle[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CreateVehicleRequest {
  code: string;
  status: VehicleStatus;
  driverId: string | null;
}

export interface UpdateVehicleRequest {
  id: string;
  code?: string;
  status?: VehicleStatus;
  driverId?: string | null;
}

export interface MyPositionResponse {
  vehicle: { id: string; code: string } | null;
  position: VehiclePosition | null;
}

export interface ReportPositionRequest {
  latitude: number;
  longitude: number;
}

export const vehiclesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listVehicles: builder.query<ListVehiclesResponse, ListVehiclesParams | void>({
      query: (params) => ({ url: '/api/vehicles', params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((vehicle) => ({ type: 'Vehicle' as const, id: vehicle.id })),
              { type: 'Vehicle' as const, id: 'LIST' },
            ]
          : [{ type: 'Vehicle' as const, id: 'LIST' }],
    }),

    createVehicle: builder.mutation<{ vehicle: Vehicle }, CreateVehicleRequest>({
      query: (body) => ({ url: '/api/vehicles', method: 'POST', body }),
      invalidatesTags: [{ type: 'Vehicle', id: 'LIST' }, 'Position'],
    }),

    updateVehicle: builder.mutation<{ vehicle: Vehicle }, UpdateVehicleRequest>({
      query: ({ id, ...body }) => ({ url: `/api/vehicles/${id}`, method: 'PATCH', body }),
      // Code/status/driver all show on the live positions table too.
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Vehicle', id },
        { type: 'Vehicle', id: 'LIST' },
        'Position',
      ],
    }),

    getPositions: builder.query<{ data: LivePosition[] }, void>({
      query: () => '/api/vehicles/positions',
      providesTags: ['Position'],
    }),

    // The driver's vehicle and its last saved position — read on load so it survives a refresh.
    getMyPosition: builder.query<MyPositionResponse, void>({
      query: () => '/api/vehicles/me/position',
      providesTags: [{ type: 'Position', id: 'MINE' }],
    }),

    // No vehicle id in the request: the server resolves it from the driver's token.
    reportPosition: builder.mutation<{ position: VehiclePosition }, ReportPositionRequest>({
      query: (body) => ({ url: '/api/vehicles/me/position', method: 'POST', body }),
      invalidatesTags: [{ type: 'Position', id: 'MINE' }],
    }),
  }),
});

export const {
  useListVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useGetPositionsQuery,
  useGetMyPositionQuery,
  useReportPositionMutation,
} = vehiclesApi;
