<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\AiKnowledge;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;
use App\Models\Setting;

class DashboardController extends Controller
{
    public function index()
    {
        // Ambil chat terbaru dan daftar pengetahuan AI
        return Inertia::render('Dashboard', [
            'initialChats' => Chat::latest()->get(),
            'initialKnowledge' => AiKnowledge::latest()->get(),
            'initialReplyMode' => Setting::where('key', 'reply_mode')->first()->value ?? 'manual',
        ]);
    }
}