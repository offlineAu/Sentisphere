<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Session;

class AuthController extends Controller
{
    public function signup(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:100',
            'email' => 'required|email|max:100|unique:user,email',
            'password' => 'required|string|min:6|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'ok' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $name = $request->input('name');
        $email = $request->input('email');
        $password = $request->input('password');

        try {
            DB::beginTransaction();

            // Insert into user table
            $userId = DB::table('user')->insertGetId([
                'email' => $email,
                'name' => $name,
                'role' => 'counselor',
                'nickname' => null,
                'last_login' => now(),
                'is_active' => 1,
                'created_at' => now(),
            ]);

            // Insert into counselor_profile with hashed password
            DB::table('counselor_profile')->insert([
                'user_id' => $userId,
                'password' => Hash::make($password),
                'department' => null,
                'contact_number' => null,
                'availability' => null,
                'year_experience' => 0,
                'created_at' => now(),
            ]);

            DB::commit();

            return response()->json(['ok' => true, 'user_id' => $userId]);
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Signup failed: '.$e->getMessage());
            return response()->json(['ok' => false, 'error' => 'Signup failed'], 500);
        }
    }
}
