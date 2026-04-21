<?php

namespace App\Jobs;

use App\Models\Chat;
use App\Models\AiKnowledge;
use App\Events\NewChatEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProcessAiReply implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $message;
    protected $sender;

    public function __construct($message, $sender)
    {
        $this->message = $message;
        $this->sender = $sender;
    }

    public function handle()
    {
        try {
            $apiKey = env('GEMINI_API_KEY');
            $knowledge = AiKnowledge::all()->pluck('content')->implode("\n");
            $prompt = "Kamu Rifai admin Hayy Tour. Jawab santai. Data:\n$knowledge\n\nPertanyaan: " . $this->message;

            $response = Http::withHeaders(['Content-Type' => 'application/json'])
                ->withoutVerifying()
                ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" . $apiKey, [
                    'contents' => [['parts' => [['text' => $prompt]]]]
                ]);

            $aiReply = $response->json()['candidates'][0]['content']['parts'][0]['text'] ?? "Maaf bro, Rifai lagi sibuk.";

            $fonnteResponse = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
                ->withoutVerifying()
                ->timeout(10)
                ->post('https://api.fonnte.com/send', [
                    'target'  => $this->sender,
                    'message' => $aiReply,
                ]);

            $fonnteId = $fonnteResponse->successful() ? ($fonnteResponse->json()['id'][0] ?? null) : null;

            $chatOut = Chat::create([
                'sender' => $this->sender, 'receiver' => 'Me', 'message' => $aiReply,
                'is_from_me' => true, 'id_fonnte' => $fonnteId, 'status' => 'sent'
            ]);
            
            broadcast(new NewChatEvent($chatOut));

        } catch (\Exception $e) {
            Log::error("Job AI Error: " . $e->getMessage());
        }
    }
}