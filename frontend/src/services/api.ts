import axios, { AxiosInstance } from 'axios';
import { DropdownConfig, LabelCheckResult, BulkUpdateResponse, TicketEntry } from '../types';

const API_BASE_URL = '/ticket-tractor-api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('tt_auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor to handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('tt_auth_token');
          localStorage.removeItem('tt_user');
          // Pass expired flag so LoginPage auto-triggers silent re-auth
          window.location.href = '/ticket-tractor/login?expired=true';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async getAuthUrl(): Promise<{ auth_url: string }> {
    const response = await this.client.get('/api/auth/login');
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  async logout() {
    const token = localStorage.getItem('tt_auth_token');
    if (token) {
      await this.client.post('/api/auth/logout', { token });
    }
    localStorage.removeItem('tt_auth_token');
    localStorage.removeItem('tt_user');
  }

  // Config
  async getDropdownConfig(): Promise<DropdownConfig> {
    const response = await this.client.get('/api/tickets/config');
    return response.data;
  }

  // Ticket operations
  async checkLabels(ticketKeys: string[]): Promise<{ results: LabelCheckResult[] }> {
    const response = await this.client.post('/api/tickets/check-labels', {
      ticket_keys: ticketKeys,
    });
    return response.data;
  }

  async getTicketLabels(ticketKey: string) {
    const response = await this.client.get(`/api/tickets/${ticketKey}/labels`);
    return response.data;
  }

  async bulkUpdateTickets(tickets: TicketEntry[]): Promise<BulkUpdateResponse> {
    const payload = tickets.map((t) => ({
      ticket_key: t.ticket_key,
      stage: t.stage,
      flow: t.flow,
      result: t.result,
      failing_cmd: t.failing_cmd,
      comment: t.comment,
      label_action: t.label_action,
    }));
    const response = await this.client.post(
      '/api/tickets/update',
      { tickets: payload },
      { timeout: 120000 }
    );
    return response.data;
  }
}

export const apiService = new ApiService();
