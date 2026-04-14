<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\AiKnowledge;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function index()
    {
        // Ambil chat terbaru dan daftar pengetahuan AI
        return Inertia::render('Dashboard', [
            'initialChats' => Chat::latest()->get(),
            'initialKnowledge' => AiKnowledge::latest()->get(), // Ini data untuk tabel AI kamu
        ]);
    }
}