<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Session;
use GuzzleHttp\Client;

class ApiProxyController extends Controller
{
    private function fastApiBase(): string
    {
        return rtrim(env('API_BASE_URL', 'http://localhost:8010'), '/');
    }

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);
        $client = new Client();
        $resp = $client->post($this->fastApiBase() . '/api/auth/token', [
            'form_params' => [
                'username' => $request->input('username'),
                'password' => $request->input('password'),
            ],
            'http_errors' => false,
        ]);
        $status = $resp->getStatusCode();
        $body = json_decode((string) $resp->getBody(), true);
        if ($status >= 200 && $status < 300 && isset($body['access_token'])) {
            Session::put('fastapi_token', $body['access_token']);
            return response()->json(['ok' => true]);
        }
        return response()->json(['ok' => false, 'error' => $body['detail'] ?? 'Login failed'], $status);
    }

    public function logout()
    {
        Session::forget('fastapi_token');
        return response()->json(['ok' => true]);
    }

    // Session status for guarding routes (front-end can poll this)
    public function session()
    {
        $isAuthed = Session::has('fastapi_token') && !empty(Session::get('fastapi_token'));
        return response()->json(['authenticated' => $isAuthed]);
    }

    public function proxy(Request $request, string $path = '')
    {
        $client = new Client();
        $method = strtolower($request->method());
        // Forward to FastAPI under its /api namespace
        $url = $this->fastApiBase() . '/api/' . ltrim($path, '/');

        $headers = ['Accept' => 'application/json'];
        $token = Session::get('fastapi_token');
        if ($token) {
            $headers['Authorization'] = 'Bearer ' . $token;
        }

        $options = [
            'headers' => $headers,
            'query' => $request->query(),
            'http_errors' => false,
        ];

        if (in_array($method, ['post', 'put', 'patch'])) {
            $options['json'] = $request->all();
        }

        $resp = $client->$method($url, $options);
        $contentType = $resp->hasHeader('Content-Type') ? $resp->getHeader('Content-Type')[0] : 'application/json';
        return response($resp->getBody()->getContents(), $resp->getStatusCode())
            ->withHeaders(['Content-Type' => $contentType]);
    }
}
