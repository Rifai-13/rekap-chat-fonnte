<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\Setting;
use App\Models\AiKnowledge;
use App\Events\NewChatEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class WebhookController extends Controller
{
    public function handle(Request $request)
    {
        $message = $request->input('message');
        $sender = $request->input('sender');

        if (!$message || !$sender) return response()->json(['status' => false]);

        $lockKey = 'lock_' . $sender . '_' . md5($message);
        if (!Cache::add($lockKey, true, 120)) {
            return response()->json(['status' => true]);
        }

        try {
            // 1. Simpan Pesan Masuk
            $chatIn = Chat::create([
                'sender'     => $sender,
                'receiver'   => 'Me',
                'message'    => $message,
                'is_from_me' => false,
                'status'     => 'unread'
            ]);

            broadcast(new NewChatEvent($chatIn));

            $mode = Setting::where('key', 'reply_mode')->value('value') ?? 'manual';

            // 2. Mode AI di Background
            if ($mode === 'ai') {
                dispatch(function () use ($message, $sender) {
                    try {
                        $aiReply = $this->askGemini($message);

                        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
                            ->withoutVerifying()
                            ->timeout(15)
                            ->post('https://api.fonnte.com/send', [
                                'target'  => $sender,
                                'message' => $aiReply,
                            ]);

                        if ($response->successful()) {
                            $resData = $response->json();
                            $chatOut = Chat::create([
                                'sender'     => $sender,
                                'receiver'   => 'Me',
                                'message'    => $aiReply,
                                'is_from_me' => true,
                                'id_fonnte'  => $resData['id'][0] ?? null,
                                'status'     => 'sent'
                            ]);
                            broadcast(new NewChatEvent($chatOut));
                        }
                    } catch (\Exception $e) {
                        Log::error("AI Background Error: " . $e->getMessage());
                    }
                })->afterResponse();
            }

            return response()->json(['status' => true]);
        } catch (\Exception $e) {
            Log::error("Webhook Fatal: " . $e->getMessage());
            return response()->json(['status' => false]);
        }
    }

    public function markAsRead(Request $request)
    {
        $sender = $request->sender;
        Chat::where('sender', $sender)->where('is_from_me', false)->update(['status' => 'read']);

        dispatch(function () use ($sender) {
            try {
                Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
                    ->withoutVerifying()
                    ->timeout(5)
                    ->post('https://api.fonnte.com/read', ['target' => $sender]);
            } catch (\Exception $e) {
            }
        })->afterResponse();

        return response()->json(['status' => true]);
    }

    public function handleStatus(Request $request)
    {
        // Fonnte mengirim ID pesan yang sukses dikirim / dibaca
        $idFonnte = $request->input('id');
        $stateId  = $request->input('stateid');
        $status   = strtolower($request->input('status') ?? $request->input('state'));

        if (!$status) return response()->json(['status' => false]);

        $chat = Chat::where(function ($q) use ($idFonnte, $stateId) {
            if ($idFonnte) $q->where('id_fonnte', $idFonnte);
            if ($stateId) $q->orWhere('stateid', $stateId);
        })->first();

        if ($chat) {
            $updateData = ['status' => $status];
            if ($stateId) $updateData['stateid'] = $stateId;

            $chat->update($updateData);
            broadcast(new NewChatEvent($chat));
        }

        return response()->json(['status' => true]);
    }

    private function askGemini($userQuestion)
    {
        $apiKey = env('GEMINI_API_KEY');
        $knowledge = AiKnowledge::all()->pluck('content')->implode("\n");
        $prompt = "Kamu Rifai admin Hayy Tour. Jawab santai. Data:\n$knowledge\n\nPertanyaan: $userQuestion";

        $response = Http::withHeaders(['Content-Type' => 'application/json'])
            ->withoutVerifying()
            ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" . $apiKey, [
                'contents' => [['parts' => [['text' => $prompt]]]]
            ]);

        return $response->json()['candidates'][0]['content']['parts'][0]['text'] ?? "Maaf bro, Rifai lagi sibuk.";
    }

    public function updateMode(Request $request)
    {
        Setting::updateOrCreate(['key' => 'reply_mode'], ['value' => $request->mode]);
        return response()->json(['status' => true]);
    }

    public function crawlWebsite(Request $request) 
    {
        try {
            $res = Http::withoutVerifying()->timeout(30)->get($request->url);
            
            if ($res->failed()) {
                return response()->json(['error' => 'Gagal akses website'], 500);
            }

            $html = $res->body();
            $html = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $html);
            $html = preg_replace('#<style(.*?)>(.*?)</style>#is', '', $html);

            $cleanText = strip_tags($html);
            
            $cleanText = preg_replace('/\s+/', ' ', $cleanText);
            
            AiKnowledge::updateOrCreate(
                ['source_url' => $request->url], 
                ['content' => trim($cleanText)]
            );

            return response()->json(['message' => 'Data terserap bersih!']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Terjadi kesalahan saat menyerap data'], 500);
        }
    }

    public function deleteKnowledge($id) 
    {
        try {
            AiKnowledge::findOrFail($id)->delete();
            return response()->json(['status' => true, 'message' => 'Berhasil dihapus']);
        } catch (\Exception $e) {
            Log::error("Gagal hapus knowledge: " . $e->getMessage());
            return response()->json(['status' => false, 'message' => 'Gagal'], 500);
        }
    }

    public function sendMessage(Request $request)
    {
        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
            ->withoutVerifying()
            ->post('https://api.fonnte.com/send', [
                'target' => $request->receiver,
                'message' => $request->message
            ]);

        $chat = Chat::create([
            'sender'     => $request->receiver,
            'receiver'   => 'Me',
            'message'    => $request->message,
            'is_from_me' => true,
            'id_fonnte'  => $response->json()['id'][0] ?? null,
            'status'     => 'sent'
        ]);
        broadcast(new NewChatEvent($chat));
        return response()->json($chat);
    }
}
