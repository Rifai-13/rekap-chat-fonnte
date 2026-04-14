<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Chat extends Model
{
    protected $fillable = ['sender', 'receiver', 'message', 'is_from_me', 'url', 'id_fonnte', 'status', 'stateid'];
}