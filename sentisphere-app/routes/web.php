<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

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
