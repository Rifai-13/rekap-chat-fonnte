<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Chat;
use App\Events\NewChatEvent;
use Illuminate\Support\Facades\Http;
use App\Models\AiKnowledge;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class WebhookController extends Controller
{
    public function handle(Request $request)
    {
        $message = $request->input('message');
        $sender = $request->input('sender');

        $lockKey = 'webhook_lock_' . $sender . '_' . md5($message);
        if (Cache::has($lockKey)) return response()->json(['status' => 'ignored']);
        Cache::put($lockKey, true, 60);

        // 1. Simpan chat pelanggan (Langsung Biru)
        $chatIn = Chat::create([
            'sender' => $sender,
            'receiver' => 'Me',
            'message' => $message,
            'is_from_me' => false,
            'status' => 'read'
        ]);
        broadcast(new NewChatEvent($chatIn));

        // 2. Tanya AI
        $aiReply = $this->askGemini($message);

        // 3. Kirim ke Fonnte
        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
            ->post('https://api.fonnte.com/send', [
                'target' => $sender,
                'message' => $aiReply,
            ]);

        $fonnteId = null;
        if ($response->successful()) {
            $resData = $response->json();
            $fonnteId = $resData['id'][0] ?? null;
        }

        // 4. Simpan balasan AI
        $chatOut = Chat::create([
            'sender' => $sender,
            'receiver' => 'Me',
            'message' => $aiReply,
            'is_from_me' => true,
            'id_fonnte' => $fonnteId,
            'status' => 'sent'
        ]);
        broadcast(new NewChatEvent($chatOut));

        return response()->json(['status' => 'success']);
    }

    public function sendMessage(Request $request)
    {
        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
            ->post('https://api.fonnte.com/send', [
                'target' => $request->receiver,
                'message' => $request->message,
            ]);

        if ($response->successful()) {
            $resData = $response->json();
            $chat = Chat::create([
                'sender' => $request->receiver,
                'receiver' => 'Me',
                'message' => $request->message,
                'is_from_me' => true,
                'id_fonnte' => $resData['id'][0] ?? null,
                'status' => 'sent'
            ]);
            broadcast(new NewChatEvent($chat))->toOthers();
            return response()->json($chat);
        }
        return response()->json(['error' => 'Gagal'], 500);
    }

    public function handleStatus(Request $request)
    {
        Log::info("Fonnte Webhook Status Received:", $request->all());

        // Fonnte kirim 'id' (internal) ATAU 'stateid' (whatsapp)
        $idFonnte = $request->input('id');
        $stateId = $request->input('stateid');

        // Fonnte kirim status lewat 'state', kadang lewat 'status'
        $status = $request->input('state') ?? $request->input('status');

        if (empty($status)) {
            return response()->json(['message' => 'Status is empty'], 400);
        }

        // Cari berdasarkan id_fonnte DULU, kalau nggak ketemu cari berdasarkan stateid
        $chat = null;
        if ($idFonnte) {
            $chat = Chat::where('id_fonnte', $idFonnte)->first();
        }

        if (!$chat && $stateId) {
            $chat = Chat::where('stateid', $stateId)->first();
        }

        if ($chat) {
            $updateData = ['status' => $status];

            // Kalau di webhook ada stateid tapi di DB belum ada, kita simpan
            if ($stateId && empty($chat->stateid)) {
                $updateData['stateid'] = $stateId;
            }

            $chat->update($updateData);
            broadcast(new NewChatEvent($chat));
            return response()->json(['status' => 'updated']);
        }

        return response()->json(['status' => 'not_found'], 404);
    }

    // ... sisanya (crawlWebsite, askGemini) sama seperti sebelumnya ...
    private function askGemini($userQuestion)
    {
        $apiKey = env('GEMINI_API_KEY');
        $knowledge = AiKnowledge::latest()->first()?->content ?? "Belum ada data.";
        $prompt = "Kamu adalah Admin WA Hayy Tour bernama Rifai. Jawab santai pake data ini: $knowledge. Pertanyaan: $userQuestion";

        return retry(2, function () use ($apiKey, $prompt) {
            $response = Http::post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" . $apiKey, [
                'contents' => [['parts' => [['text' => $prompt]]]]
            ]);
            $data = $response->json();
            return $data['candidates'][0]['content']['parts'][0]['text'] ?? "Maaf, belum tahu.";
        }, 1000);
    }

    public function deleteKnowledge($id)
    {
        try {
            $knowledge = AiKnowledge::findOrFail($id);
            $knowledge->delete();

            return response()->json(['message' => 'Data berhasil dihapus']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Gagal menghapus data'], 500);
        }
    }
}