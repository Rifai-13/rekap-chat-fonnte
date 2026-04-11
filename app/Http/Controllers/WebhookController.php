<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Chat;
use App\Events\NewChatEvent;
use Illuminate\Support\Facades\Http;

class WebhookController extends Controller
{
    public function handle(Request $request)
    {
        $sender = $request->input('sender');
        $message = $request->input('message');
        $receiver = $request->input('device');
        $url = $request->input('url');

        if ($sender && $message) {
            $chat = Chat::create([
                'sender' => $sender,
                'receiver' => $receiver,
                'message' => $message,
                'url' => $url,
            ]);

            broadcast(new NewChatEvent($chat))->toOthers();

            return response()->json(['status' => 'success']);
        }

        return response()->json(['status' => 'error'], 400);
    }

    public function sendMessage(Request $request)
    {
        $request->validate([
            'receiver' => 'required',
            'message' => 'required',
            'file' => 'nullable|file|mimes:jpg,jpeg,png,pdf,doc,docx|max:2048',
        ]);

        $fileUrl = null;

        // Logika Simpan File ke Storage
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = time() . '_' . $file->getClientOriginalName();
            // Simpan ke storage/app/public/uploads
            $path = $file->storeAs('uploads', $fileName, 'public');

            // Buat URL lengkap (pake alamat Ngrok dari .env)
            $fileUrl = asset('storage/' . $path);
        }
        // 1. Kirim ke API Fonnte
        $response = Http::withHeaders([
            'Authorization' => env('FONNTE_TOKEN'),
        ])->post('https://api.fonnte.com/send', [
            'target' => $request->receiver,
            'message' => $request->message ?? '',
            'url' => $fileUrl,
        ]);

        if ($response->successful()) {
            // 2. Simpan ke Database sebagai "Pesan Terkirim"
            $chat = \App\Models\Chat::create([
                'sender' => $request->receiver, // kita simpan targetnya sebagai sender biar masuk list chat yang sama
                'receiver' => 'Me',
                'message' => $request->message ?? ($request->hasFile('file') ? '[Media File]' : ''),
                'url' => $fileUrl,
                'is_from_me' => true, // Tanda kalau ini dari admin
            ]);

            // 3. Broadcast biar langsung muncul di layar (Real-time)
            broadcast(new NewChatEvent($chat))->toOthers();

            return response()->json($chat);
        }

        return response()->json(['error' => 'Gagal kirim pesan'], 500);
    }
}