<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Http\Controllers\ApiProxyController;
use App\Http\Controllers\AuthController;

// Dashboard
Route::get('/', function () {
    return Inertia::render('CounselorDashboard');
})->name('home');

Route::get('/dashboard', function () {
    return Inertia::render('CounselorDashboard');
})->name('dashboard');

// Chat
Route::get('/chat', function () {
    return Inertia::render('Chat');
});

// Appointments
Route::get('/appointments', function () {
    return Inertia::render('Appointments');
});

// Reports
Route::get('/reports', function () {
    return Inertia::render('Reports');
});

// Profile
Route::get('/profile', function () {
    return Inertia::render('Profile');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

// FastAPI auth via Laravel (session-managed JWT)
Route::post('/auth/login-fastapi', [ApiProxyController::class, 'login'])->name('fastapi.login');
Route::post('/auth/logout-fastapi', [ApiProxyController::class, 'logout'])->name('fastapi.logout');
Route::get('/auth/session', [ApiProxyController::class, 'session'])->name('fastapi.session');
Route::post('/auth/signup', [AuthController::class, 'signup'])->name('auth.signup');

// Login Page (FastAPI via Laravel session) - defined AFTER default auth to take precedence
Route::get('/login', function () {
    return Inertia::render('Login', [ 'hideSidebar' => true ]);
})->name('login');

// Proxy all /api requests to FastAPI (BFF pattern)
Route::any('/api/{path?}', [ApiProxyController::class, 'proxy'])
    ->where('path', '.*')
    ->name('fastapi.proxy');
